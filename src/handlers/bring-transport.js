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

var AWS = require('aws-sdk');
AWS.config.update({region:'eu-west-1'});

function createBringAddress(address, contactPerson, notes, reference) {
	let bringAddress = new Object(); 
	if (contactPerson != null) {
		let contact = new Object();
		contact.name = contactPerson.name;
		contact.email = contactPerson.email;
		contact.phoneNumber = contactPerson.mobileNumber;
		bringAddress.contact = contact;
	} 
	bringAddress.name = address.addressee;
	bringAddress.addressLine = address.streetNameAndNumber;
	bringAddress.addressLine2 = address.districtOrCityArea;
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

async function book(ims, detail) {
	
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
	
	let recipient = createBringAddress(shipment.deliveryAddress, shipment.contactPerson, shipment.notesOnDelivery, shipment.customersReference);
	
	let sender = createBringAddress(context.address, context.contactPerson, null, shipment.ourReference);
	
	let consignee = recipient;
	
	let consignor = sender;
	
	consignment.parties = { consignee, consignor, recipient, sender };
	
	let parcels = [];
	let shippingContainers = shipment.shippingContainers;
	shippingContainers.forEach(function(shippingContainer) {
		let parcel = new Object();
		parcel.weightInKg = shippingContainer.grossWeight;
		let dimensions = shippingContainer.dimensions;
		parcel.dimensions = { heightInCm: dimensions.height * 100, 
				lengthInCm: dimensions.length * 100, 
				widthInCm: dimensions.width * 100 };
		parcels.push(parcel);
	});
	
	consignment.packages = parcels;
	
	let product = new Object();
	product.id = shipment.termsOfDelivery;
	product.incotermRule = shipment.incoterms;
	product.customerNumber = '6';
	consignment.product = product;

	consignment.shippingDateTime = Date.now();

	booking.consignments.push(consignment);
	
	booking.schemaVersion = 1;
	booking.testIndicator = setup.testIndicator;
	
	console.log(JSON.stringify(booking));

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
		
		let message = new Object();
		message.time = Date.now();
		message.source = "BringTransport";
		message.messageType = "ERROR";
		message.messageText = "Failed to register shipment " + shipment.shipmentNumber + " with Bring. Bring says: " + messageText;
		message.deviceName = detail.deviceName;
		message.userId = detail.userId;
		await ims.post("events/" + detail.eventId + "/messages", message);
		
		return null;
		
	} 
	
	if (response.status == 500) {

		let message = new Object();
		message.time = Date.now();
		message.source = "BringTransport";
		message.messageType = "ERROR";
		message.messageText = "Failed to register shipment " + shipment.shipmentNumber + " with Bring due to internal error on their server.";
		message.deviceName = detail.deviceName;
		message.userId = detail.userId;
		await ims.post("events/" + detail.eventId + "/messages", message);
	
		return null;	
	} 

    let bringResponse = response.data;
    
    console.log(JSON.stringify(bringResponse));

	/*    
	parcels = bringResponse.Parcels;
	for (let i = 0; i < parcels.length; i++) {
		let shippingContainer = shippingContainers[i];
		let parcel = parcels[i];
		let trackingUrl = 'https://gls-group.eu/DK/da/find-pakke?txtAction=71000&match=' + parcel.ParcelNumber;
		await ims.patch("shippingContainers/" + shippingContainer.id, { trackingNumber: parcel.ParcelNumber, trackingUrl: trackingUrl });
	}

	await ims.patch("shipments/" + detail.shipmentId, { carriersShipmentNumber: bringResponse.ConsignmentId });

	return { base64EncodedContent: bringResponse.PDF, fileName: "SHIPPING_LABEL_" + detail.documentId + ".pdf" };
	*/
	
	return null;
}

exports.bookingHandler = async (event, context) => {

    console.info(JSON.stringify(event));

    var detail = event.detail;

	let ims = await getIMS();

//	await ims.patch('/documents/' + detail.documentId, { workStatus: 'ON_GOING' });
	
    let label = await book(ims, detail);
  
/*    
    if (label != null) {
		await ims.post('/documents/' + detail.documentId + '/attachments', label);
		await ims.patch('/documents/' + detail.documentId, { workStatus: 'DONE' });
    } else {
		await ims.patch('/documents/' + detail.documentId, { workStatus: 'FAILED' });
    }
*/    
	return "done";
	
};

