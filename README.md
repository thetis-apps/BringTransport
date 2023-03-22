# Introduction

This application enables the printing of shipping labels from the carrier Bring as an integrated part of your packing process. 

# Installation

You install the application from the connection view in Thetis IMS. The name of the application is 'thetis-ims-bring-transport'.

Upon installation the application creates a carrier by the name 'Bring'.

# Configuration

In the data document of the carrier named 'Bring':

```
{
  "BringTransport": {
    "apiKey": "292a7cc5-7f3d-4ed7-80fd-692885415bf9",
    "apiUid": "lmp@thetis-ims.com",
    "defaultCustomerNumber": "6",
    "testIndicator": true
  }
}
```

For your convenience the application is initially configured to use our test account. You may use this configuration for test purposes.

To get your own credentials contact Bring.

# Shipment options

#### termsOfDelivery

This field may contain the product identification.

#### Data document

```
"product": {
  "customerNumber": "6",
  "..."
}
```


# Events

## Transport booking created

When a transport booking is created, the application registers the shipment with Bring. The shipment is updated with Bring shipment number.

The shipping containers are updated with the tracking numbers assigned to the corresponding Bring packages.

Shipping labels are attached to the transport booking.

