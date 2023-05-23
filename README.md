# Introduction

This application enables the printing of shipping labels from the carrier Bring as an integrated part of your packing process. 

# Installation

You install the application from the connection view in Thetis IMS. The name of the application is 'thetis-ims-bring-transport'.

Upon installation the application creates a carrier by the name 'Bring'.

For your convenience the application is initially configured to use our test account. You may use this configuration for test purposes. To get your own credentials you must contact Bring.

# Configuration

In the data document of the carrier named 'Bring':

```
{
  "BringTransport": {
    "apiKey": "292a7cc5-7f3d-4ed7-80fd-692885415bf9",
    "apiUid": "lmp@thetis-ims.com",
    "defaultCustomerNumber": "6",
    "testIndicator": true,
    "instructions": []
  }
}
```

In the instructions array you must add objects similar to this:

```
      {
        "product": {
          "id": "PICKUP_PARCEL",
          "additionalServices": [
            {
              "id": "EVARSLING"
            }
          ]
        },
        "shipmentPattern": {
          "deliveryAddress": {
            "countryCode": [
              "DK"
            ]
          },
          "deliverToPickUpPoint": [
            true
          ]
        }
      },
```

The shipment pattern designates the shipments that this instruction applies to. This example instruction applies to all shipments that must be delivered to a pick up point in Denmark.

The product is a reference to Brings catalog of offered products. You must consult Brings documentation for further information.

The application will use the first instruction in the array that has a pattern that matches the shipment in question.

# Events

## Transport booking created

When a transport booking is created, the application registers the shipment with Bring. The shipment is updated with Bring shipment number.

The shipping containers are updated with the tracking numbers assigned to the corresponding Bring packages.

Shipping labels are attached to the transport booking.

