/**
 * Copyright 2021 Thetis Apps Aps
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * 
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * 
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const axios = require('axios');

function patternMatches(object, pattern) {
	let matches = true;
	for (let fieldName in pattern) {
		let fieldValue = pattern[fieldName];
		if (Array.isArray(fieldValue)) {
			if (!pattern[fieldName].includes(object[fieldName])) {
				matches = false;
			}
		} else {
			if (!patternMatches(object[fieldName], pattern[fieldName])) {
				matches = false;
			}
		}
	}
	return matches;
}

function findInstruction(instructions, shipment) {
	for (let instruction of instructions) {
		if (patternMatches(shipment, instruction.shipmentPattern)) {
			return instruction;
		}
	}
	return null;
}

function createBringAddress(address, contactPerson, notes, reference) {
	let bringAddress = new Object(); 
	if (contactPerson != null) {
		let contact = new Object();
		contact.name = contactPerson.name;
		contact.email = contactPerson.email;
		contact.phoneNumber = contactPerson.mobileNumber != null ? contactPerson.mobileNumber : contact.phoneNumber;
		bringAddress.contact = contact;
	} 
	bringAddress.name = address.addressee;
	bringAddress.addressLine = address.streetNameAndNumber;
	bringAddress.addressLine2 = address.districtOrCityArea != null ? address.districtOrCityArea : '';
	bringAddress.city = address.cityTownOrVillage;
	bringAddress.countryCode = address.countryCode;
	bringAddress.postalCode = address.postalCode;
	bringAddress.reference = reference;
	bringAddress.additionalAddressInfo = notes;
	return bringAddress;
}

/**
 * Send a response to CloudFormation regarding progress in creating resource.
 */
async function sendResponse(input, context, responseStatus, reason) {

	let responseUrl = input.ResponseURL;

	let output = new Object();
	output.Status = responseStatus;
	output.PhysicalResourceId = "StaticFiles";
	output.StackId = input.StackId;
	output.RequestId = input.RequestId;
	output.LogicalResourceId = input.LogicalResourceId;
	output.Reason = reason;
	await axios.put(responseUrl, output);
}

exports.initializer = async (input, context) => {
	
	try {
		let ims = await getIMS();
		let requestType = input.RequestType;
		if (requestType == "Create") {
			let carrier = new Object();
			carrier.carrierName = "Bring";
		    let setup = new Object();
		    setup.apiKey = '292a7cc5-7f3d-4ed7-80fd-692885415bf9';
		    setup.apiUid = 'lmp@thetis-ims.com';
		    setup.customerNumber = '6';
		    setup.testIndicator = true;
			let dataDocument = new Object();
			dataDocument.BringTransport = setup;
			carrier.dataDocument = JSON.stringify(dataDocument);
			await ims.post("carriers", carrier);
		}
		await sendResponse(input, context, "SUCCESS", "OK");

	} catch (error) {
		await sendResponse(input, context, "SUCCESS", JSON.stringify(error));
	}

};

var cachedIMS = null;

async function getIMS() {
	
	if (cachedIMS == null) {
		
	    const authUrl = "https://auth.thetis-ims.com/oauth2/";
	    const apiUrl = "https://api.thetis-ims.com/2/";
	
		var clientId = process.env.ClientId;   
		var clientSecret = process.env.ClientSecret; 
		var apiKey = process.env.ApiKey;  
		
	    let data = clientId + ":" + clientSecret;
		let base64data = Buffer.from(data, 'UTF-8').toString('base64');	
		
		var imsAuth = axios.create({
				baseURL: authUrl,
				headers: { Authorization: "Basic " + base64data, 'Content-Type': "application/x-www-form-urlencoded" },
				responseType: 'json'
			});
	    
	    var response = await imsAuth.post("token", 'grant_type=client_credentials');
	    var token = response.data.token_type + " " + response.data.access_token;
	    
	    var ims = axios.create({
	    		baseURL: apiUrl,
	    		headers: { "Authorization": token, "x-api-key": apiKey, "Content-Type": "application/json" }
	    	});
		
	
		ims.interceptors.response.use(function (response) {
				console.log("SUCCESS " + JSON.stringify(response.data));
	 	    	return response;
			}, function (error) {
				console.log(JSON.stringify(error));
				if (error.response) {
					console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
				}
		    	return Promise.reject(error);
			});
		
		cachedIMS = ims;
	}
	
	return cachedIMS;
}

async function getBring(setup) {
 
    const url = "https://api.bring.com/booking-api/api/";
    
    var bring = axios.create({
		baseURL: url,
		headers: { 'X-Mybring-API-Key': setup.apiKey, 'X-Mybring-API-Uid': setup.apiUid, 'X-Bring-Client-URL': 'https://public.thetis-ims.com' },
		validateStatus: function (status) {
		    return status >= 200 && status < 300 || status == 400 || status == 500; // default
		}
	});
	
	bring.interceptors.response.use(function (response) {
			console.log("SUCCESS Status: " + response.status + " Body: " + JSON.stringify(response.data));
 	    	return response;
		}, function (error) {
			if (error.response) {
				console.log("FAILURE " + error.response.status + " - " + JSON.stringify(error.response.data));
			}
	    	return Promise.reject(error);
		});

	return bring;
}

function lookupCarrier(carriers, carrierName) {
	let i = 0;
    let found = false;
    while (!found && i < carriers.length) {
    	let carrier = carriers[i];
    	if (carrier.carrierName == carrierName) {
    		found = true;
    	} else {
    		i++;
    	}	
    }
    
    if (!found) {
    	throw new Error('No carrier by the name ' + carrierName);
    }

	return carriers[i];
}

/**
 * Send an event message to Thetis IMS
 */
async function sendEventMessage(ims, detail, text) {
	let message = new Object();
	message.time = Date.now();
	message.source = "BringTransport";
	message.messageType = "ERROR";
	message.messageText = text;
	message.deviceName = detail.deviceName;
	message.userId = detail.userId;
	await ims.post("events/" + detail.eventId + "/messages", message);
}

/**
 * Register the handling of this transport booking failed
 */
async function fail(ims, detail, text) {
	await sendEventMessage(ims, detail, text);	
	await ims.patch('/documents/' + detail.documentId, { workStatus: 'FAILED' });
}

/**
 * Book transport for a shipment
 */ 
exports.bookingHandler = async (event, x) => {

    console.info(JSON.stringify(event));

    var detail = event.detail;

	let ims = await getIMS();

	await ims.patch('/documents/' + detail.documentId, { workStatus: 'ON_GOING' });
	
	let shipmentId = detail.shipmentId;
	let contextId = detail.contextId;
	
    let response = await ims.get("shipments/" + shipmentId);
    let shipment = response.data;

    response = await ims.get("contexts/" + contextId);
	let context = response.data;    
    
    response = await ims.get("carriers");
    let carriers = response.data;
    
    let carrier = lookupCarrier(carriers, 'Bring');
    let dataDocument = JSON.parse(carrier.dataDocument);
    let setup = dataDocument.BringTransport;
    
	let bring = await getBring(setup);

	let booking = new Object();
	booking.consignments = [];
	
	let consignment = new Object();
	
	consignment.correlationId = shipment.shipmentNumber;
	
	let recipient = createBringAddress(shipment.deliveryAddress, shipment.contactPerson, shipment.notesOnDelivery, shipment.customersReference);
	
	let sender = createBringAddress(context.address, context.contactPerson, null, shipment.ourReference);
	
//	let consignee = recipient;
	
//	let consignor = sender;

	let pickupPoint;
	if (shipment.deliverToPickUpPoint) {
		pickupPoint = { countryCode: shipment.deliveryAddress.countryCode, id: shipment.pickUpPointId };
	}
	
	consignment.parties = { pickupPoint, recipient, sender };
	
	let parcels = [];
	let shippingContainers = shipment.shippingContainers;
	for (let shippingContainer of shippingContainers) {
		let parcel = new Object();
		parcel.correlationId = shippingContainer.id;
		parcel.weightInKg = shippingContainer.grossWeight != null ? shippingContainer.grossWeight : null;
		let dimensions = shippingContainer.dimensions;
		if (dimensions != null) {
			parcel.dimensions = { 
					heightInCm: dimensions.height != null ? dimensions.height * 100 : null, 
					lengthInCm: dimensions.length != null ? dimensions.length * 100 : null, 
					widthInCm: dimensions.width != null ? dimensions.width * 100 : null };
		}
		parcels.push(parcel);
	}
	
	consignment.packages = parcels;
	
	let instruction = findInstruction(setup.instructions, shipment);
	if (instruction == null) {	
		await fail(ims, detail, "No transport instruction found matching shipment " + shipment.shipmentNumber);
		return null;
	}

	let product = instruction.product;
	product.incotermRule = shipment.incoterms;
	product.customerNumber = setup.customerNumber;
	for (let service of product.additionalServices) {
		if (service.id == 'FLEX_DELIVERY') {
			service.message = shipment.notesOnDelivery;
		} else if (service.id == 'EVARSLING') {
			service.email = recipient.contact.email;
			service.mobile = recipient.contact.phoneNumber;
		}
	}
	consignment.product = product;

	consignment.shippingDateTime = Date.now();

	booking.consignments.push(consignment);
	
	booking.schemaVersion = 1;
	booking.testIndicator = setup.testIndicator;
	
    response = await bring.post("booking", booking);

	if (response.status == 400) {

		let messageText = '';		
		let errorResponse = response.data;
		for (let consignment of errorResponse.consignments) {
			for (let error of consignment.errors) {
				for (let message of error.messages) {
					messageText = messageText + message.message + ' ';
				}
			}
		}
		
		await fail(ims, detail, "Failed to register shipment " + shipment.shipmentNumber + " with Bring. Bring says: " + messageText);
		
	} else if (response.status < 300) {

	    let bringResponse = response.data;
	    
	    let confirmation = bringResponse.consignments[0].confirmation;
	    let trackingUrl = confirmation.links.tracking;
		parcels = confirmation.packages;
		for (let parcel of parcels) {
			for (let shippingContainer of shippingContainers) {
				if (shippingContainer.id == parcel.correlationId) {
					await ims.patch("shippingContainers/" + shippingContainer.id, { trackingNumber: parcel.packageNumber, trackingUrl: trackingUrl });
				}
			}
		}
	
		await ims.patch("shipments/" + detail.shipmentId, { carriersShipmentNumber: confirmation.consignmentNumber });
	
		let label = { presignedUrl: confirmation.links.labels, fileName: "SHIPPING_LABEL_" + detail.documentId + ".pdf" };
	
		await ims.post('/documents/' + detail.documentId + '/attachments', label);
		await ims.patch('/documents/' + detail.documentId, { workStatus: 'DONE' });

	} else {

		await fail(ims, detail, "Call to Bring failed with status code " + response.status + " when trying to book transport for shipment " + shipment.shipmentNumber);
		
	} 

    
	return "done";
	
};

