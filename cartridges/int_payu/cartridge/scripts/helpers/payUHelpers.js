"use strict";

var PayUFactory = require("*/cartridge/scripts/utils/PayuFactory");
var PaymentService = require("*/cartridge/scripts/services/PaymentService");
var Logger = require("dw/system/Logger");

function getDocumentTypes() {
    var countryCode = PayUFactory.CONFIGS.COUNTRY;
    var allDocumentTypes = PayUFactory.CONFIGS.SUPPORTED_DOCUMENT_TYPES;

    if (allDocumentTypes) {
        allDocumentTypes = JSON.parse(allDocumentTypes);
    }
    var supportedDocumentTypes;
    if (allDocumentTypes && Object.keys(allDocumentTypes).length > 0) {
        supportedDocumentTypes = allDocumentTypes[countryCode];
    }

    return supportedDocumentTypes || [];
}

function createPayment(order, token) {
    var requestDataContainer =
        PayUFactory.buildCreatePaymentRequestContainer(order);
    var createPaymentServiceResponse = PaymentService.call(requestDataContainer);
    if (
        createPaymentServiceResponse &&
        createPaymentServiceResponse.object &&
        createPaymentServiceResponse.object.status === "Initialized"
    ) {
        return createPaymentServiceResponse.object;
    } else {
        return {
            error: true,
            message: "Something went wrong.",
            details: createPaymentServiceResponse.object,
        };
    }
}

function getCardWiseInstallments() {
    try {
        var country = PayUFactory.CONFIGS.COUNTRY;

        if (!country) return [];
        var payUCardWiseInstallments = PayUFactory.CONFIGS.CARD_WISE_INSTALLMENTS;

        if (!payUCardWiseInstallments) return [];

        var parsePayUCardWiseInstallments = JSON.parse(payUCardWiseInstallments);

        var countrySpecificInstallmentsOptions =
            parsePayUCardWiseInstallments[country];

        return countrySpecificInstallmentsOptions || [];
    } catch (e) {
        Logger.error("PAYU HELPERS ERROR: {0}", JSON.stringify(e));
    }
}
var payUHelpers = {
    getCardWiseInstallments: getCardWiseInstallments,
    createCardToken: function(paymentInformation) {
        try {
            var requestDataContainer =
                PayUFactory.buildCreateTokenRequestContainer(paymentInformation);
            var cardTokenServiceResponse = PaymentService.call(requestDataContainer);

            if (
                !cardTokenServiceResponse ||
                cardTokenServiceResponse.error ||
                !cardTokenServiceResponse.object
            ) {
                Logger.error(
                    "PAYU SERVICE ERROR: STATUS: {0}, MESSAGE: {1}",
                    cardTokenServiceResponse ? cardTokenServiceResponse.error : "Unknown",
                    cardTokenServiceResponse ?
                    cardTokenServiceResponse.errorMessage :
                    "No response from service"
                );
                return {
                    error: true,
                    message: "Tokenization failed",
                    details: cardTokenServiceResponse,
                };
            }

            return {
                error: false,
                token: cardTokenServiceResponse.object.token,
                encryptedCvv: cardTokenServiceResponse.object.encrypted_cvv,
            };
        } catch (e) {
            Logger.error("EXCEPTION in createCardToken: {0}", JSON.stringify(e));
            return {
                error: true,
                message: "Unexpected error occurred",
                details: JSON.stringify(e),
            };
        }
    },

    retrieveCustomer: function(customerId) {
        var requestDataContainer =
            PayUFactory.buildRetrieveCustomerRequestContainer(customerId);
        var retrieveCustomerServiceResponse =
            PaymentService.call(requestDataContainer);

        if (
            retrieveCustomerServiceResponse &&
            !retrieveCustomerServiceResponse.error &&
            retrieveCustomerServiceResponse.object
        ) {
            return retrieveCustomerServiceResponse.object;
        } else if (
            retrieveCustomerServiceResponse &&
            retrieveCustomerServiceResponse.error
        ) {
            return {
                error: true,
                message: "Retrieve customer failed",
                details: retrieveCustomerServiceResponse,
            };
        }
    },

    createSavedCardToken: function(cardToken, securityCode) {
        var requestDataContainer = PayUFactory.buildSavedCardTokenRequestContainer(
            cardToken,
            securityCode
        );
        var cardTokenServiceResponse = PaymentService.call(requestDataContainer);

        if (
            !cardTokenServiceResponse ||
            cardTokenServiceResponse.error ||
            !cardTokenServiceResponse.object
        ) {
            Logger.error(
                "PAYU SERVICE ERROR: STATUS: {0}, MESSAGE: {1}",
                cardTokenServiceResponse ? cardTokenServiceResponse.error : "Unknown",
                cardTokenServiceResponse ?
                cardTokenServiceResponse.errorMessage :
                "No response from service"
            );
            return {
                error: true,
                message: "Tokenization failed",
                details: cardTokenServiceResponse,
            };
        }
        return {
            error: false,
            token: cardTokenServiceResponse.object.token
        };
    },

    createPayment: createPayment,
    authorizePayment: function(paymentId, order, token, cvv) {
        var requestDataContainer =
            PayUFactory.buildAuthorizePaymentRequestContainer(
                paymentId,
                order,
                token,
                cvv
            );
        var authorizePaymentServiceResponse =
            PaymentService.call(requestDataContainer);
        if (
            !authorizePaymentServiceResponse.error &&
            authorizePaymentServiceResponse.object
        ) {
            if (
                authorizePaymentServiceResponse.object.result &&
                authorizePaymentServiceResponse.object.result.status === "Succeed"
            ) {
                return authorizePaymentServiceResponse.object;
            } else if (
                authorizePaymentServiceResponse.object.result &&
                authorizePaymentServiceResponse.object.result.status === "Pending" &&
                PayUFactory.CONFIGS.THREE_D_S_CONFIG !== "DISABLED"
            ) {
                return authorizePaymentServiceResponse.object;
            } else if (
                authorizePaymentServiceResponse.object.result &&
                authorizePaymentServiceResponse.object.result.status === "Failed"
            ) {
                Logger.error(
                    "PAYU AUTHORIZE ERROR: Category : {0} | Description: {1}",
                    authorizePaymentServiceResponse.object.result.category,
                    authorizePaymentServiceResponse.object.result.description
                );
                return {
                    error: true,
                    message: "Authorization failed",
                    details: authorizePaymentServiceResponse.object.result,
                };
            } else {
                return {
                    error: true,
                    message: "Something went Wrong",
                    details: authorizePaymentServiceResponse.object.result,
                };
            }
        } else if (authorizePaymentServiceResponse.error === 500 || authorizePaymentServiceResponse.error === 503) {
            return {
				error: true,
				message: 'Timeout Error',
				timeout: true
			}
        }
    },

    retrieveAuthorization: function(authorizationId, paymentId) {
        var requestDataContainer =
            PayUFactory.buildRetrieveAuthorizationRequestContainer(
                authorizationId,
                paymentId
            );
        var retrieveAuthorizationResponse =
            PaymentService.call(requestDataContainer);
        if (
            retrieveAuthorizationResponse &&
            !retrieveAuthorizationResponse.error &&
            retrieveAuthorizationResponse.object
        ) {
            return retrieveAuthorizationResponse.object;
        } else {
            return {
                error: true,
                message: "Retrieve customer failed",
                details: retrieveAuthorizationResponse,
            };
        }
    },

    retrievePayment: function(paymentId) {
        var requestDataContainer = PayUFactory.buildRetrievePaymentRequestContainer(paymentId);
        var retrievePaymentResponse = PaymentService.call(requestDataContainer);
        if (
            retrievePaymentResponse &&
            !retrievePaymentResponse.error &&
            retrievePaymentResponse.object
        ) {
            return retrievePaymentResponse.object;
        } else if (retrievePaymentResponse && retrievePaymentResponse.error) {
            return {
                error: true,
                message: "Retrieve payment failed",
                details: retrievePaymentResponse,
            };
        }
    },

    capturePayment: function(paymentId) {
        var requestDataContainer =
            PayUFactory.buildCapturePaymentRequestContainer(paymentId);
        var capturePaymentServiceResponse =
            PaymentService.call(requestDataContainer);
        if (
            !capturePaymentServiceResponse.error &&
            capturePaymentServiceResponse.object
        ) {
            if (
                capturePaymentServiceResponse.object &&
                capturePaymentServiceResponse.object.result.status === "Succeed"
            ) {
                return capturePaymentServiceResponse.object;
            } else if (
                capturePaymentServiceResponse.object &&
                capturePaymentServiceResponse.object.result.status === "Failed"
            ) {
                return {
                    error: true,
                    message: "Capture failed",
                    details: capturePaymentServiceResponse,
                };
            } else {
                return {
                    error: true,
                    message: "Something went wrong.",
                    details: capturePaymentServiceResponse,
                };
            }
        } else if (
            capturePaymentServiceResponse &&
            capturePaymentServiceResponse.error
        ) {
            return {
                error: true,
                message: "Capture failed",
                details: capturePaymentServiceResponse,
            };
        }
    },

    createCustomer: function(customer) {
        var requestDataContainer =
            PayUFactory.buildCreateCustomerRequestContainer(customer);
        var createCustomerResponse = PaymentService.call(requestDataContainer);
        if (!createCustomerResponse.error && createCustomerResponse.object) {
            return createCustomerResponse.object;
        } else if (createCustomerResponse && createCustomerResponse.error) {
            return {
                error: true,
                message: "PAYU: Create Customer Failed.",
                details: createCustomerResponse,
            };
        }
    },

    createPaymentMethod: function(customerId, cardToken) {
        var requestDataContainer =
            PayUFactory.buildCreatePaymentMethodRequestContainer(
                customerId,
                cardToken
            );
        var createPaymentMethodResponse = PaymentService.call(requestDataContainer);
        if (
            !createPaymentMethodResponse.error &&
            createPaymentMethodResponse.object
        ) {
            return createPaymentMethodResponse.object;
        } else if (
            createPaymentMethodResponse &&
            createPaymentMethodResponse.error
        ) {
            return {
                error: true,
                message: "PAYU: Create Payment Method Failed.",
                details: createPaymentMethodResponse,
            };
        }
    },

    // Method to initiate Refund.
    initiateRefund: function(paymentId, refundReason) {
        var requestDataContainer = PayUFactory.buildRefundRequestContainer(
            paymentId,
            refundReason
        );
        var initiateRefundResponse = PaymentService.call(requestDataContainer);
        if (!initiateRefundResponse.error && initiateRefundResponse.object) {
            return initiateRefundResponse.object;
        } else if (initiateRefundResponse && initiateRefundResponse.error) {
            return {
                error: true,
                message: "PAYU: Refund Failed.",
            };
        }
    },

    // Method to initiate Partial Refund.
    initiatePartialRefund: function(paymentId, amount, refundReason) {
        var requestDataContainer = PayUFactory.buildPartialRefundRequestContainer(
            paymentId,
            amount,
            refundReason
        );
        var initiateRefundResponse = PaymentService.call(requestDataContainer);
        if (!initiateRefundResponse.error && initiateRefundResponse.object) {
            return initiateRefundResponse.object;
        } else if (initiateRefundResponse && initiateRefundResponse.error) {
            return {
                error: true,
                message: "PAYU: Partial Refund Failed.",
            };
        }
    },

    charge: function(order, paymentMethod, ipKey) {
        var requestDataContainer = PayUFactory.buildChargeRequestContainer(
            order,
            paymentMethod,
            ipKey
        );
        var chargeResponse = PaymentService.call(requestDataContainer);
        if (chargeResponse && !chargeResponse.ok) {
            return {
                error: true,
                message: "PAYU: Charge Failed.",
                details: chargeResponse,
            };
        } else if (
            chargeResponse &&
            chargeResponse.object &&
            chargeResponse.object.result.status === "Failed"
        ) {
            return {
                error: true,
                message: "PAYU: Charge Failed.",
            };
        } else if (chargeResponse.ok && chargeResponse.object) {
            return chargeResponse.object;
        } else if (chargeResponse && chargeResponse.error) {
            return {
                error: true,
                message: "PAYU: Charge Failed.",
                details: chargeResponse,
            };
        }
    },

    chargeCard: function(paymentId, order, token, cvv) {
        var requestDataContainer = PayUFactory.buildChargeCardRequestContainer(
            paymentId,
            order,
            token,
            cvv
        );
        var chargeResponse = PaymentService.call(requestDataContainer);
        if (chargeResponse && !chargeResponse.ok) {
            if (chargeResponse.error === 500 || chargeResponse.error === 503) {
				return {
					error: true,
					message: 'Timeout Error',
					timeout: true
				}
			}
            return {
                error: true,
                message: "PAYU: Charge Failed.",
                details: chargeResponse,
            };
        } else if (
            chargeResponse &&
            chargeResponse.object &&
            chargeResponse.object.result.status === "Failed"
        ) {
            return {
                error: true,
                message: "PAYU: Charge Failed.",
            };
        } else if (chargeResponse.ok && chargeResponse.object) {
            return chargeResponse.object;
        }
    },

    void: function(paymentId) {
        var requestDataContainer = PayUFactory.buildVoidRequestContainer(paymentId);
        var voidResponse = PaymentService.call(requestDataContainer);
        if (voidResponse && !voidResponse.ok) {
            return {
                error: true,
                message: "PAYU: Void Failed.",
                details: voidResponse,
            };
        } else if (voidResponse.ok && voidResponse.object) {
            return voidResponse.object;
        }
    },

    retrieveRefunds: function(paymentId) {
        var requestDataContainer =
            PayUFactory.buildRetrieveRefundsRequestContainer(paymentId);
        var refundsResponse = PaymentService.call(requestDataContainer);

        if (refundsResponse && !refundsResponse.ok) {
            return {
                error: true,
                message: "PAYU: Retrieve Refunds Failed.",
                details: refundsResponse,
            };
        } else {
            return refundsResponse.object;
        }
    },

    convertToMinorUnits: function(amount) {
        return amount * 100;
    },

    convertToMajorUnits: function(amount) {
        return amount / 100;
    },

    /**
     * Calculates the total refunded amount from a list of refunds
     * where the refund status is marked as 'SUCCEED'.
     *
     * @param {Array} refunds - List of refund objects.
     * @returns {number} Total refunded amount (in minor units).
     */
    getTotalRefundAmount: function(refunds) {
        var PAYU_FACTORY = require("*/cartridge/scripts/utils/PayuFactory");
        var totalRefundAmount = 0;
        for (var i = 0; i < refunds.length; i++) {
            if (refunds[i].result.status === PAYU_FACTORY.STATUS.RESPONSE.SUCCEED) {
                totalRefundAmount += refunds[i].amount;
            }
        }
        return totalRefundAmount;
    },

    isCashPaymentMethod: function(paymentMethodId) {
        var cashPaymentMethods = [
            "PAY_U_CASH",
            "PAGOEFECTIVO",
            "BOLETO_BANCARIO",
            "COBRO_EXPRESS",
            "PAGOFACIL",
            "RAPIPAGO",
            "OXXO",
            "SEVEN_ELEVEN",
            "SPEI",
            "OTHERS_CASH_MX",
            "BANK_REFERENCED",
            "EFECTY",
            "OTHERS_CASH",
        ];

        return cashPaymentMethods.includes(paymentMethodId);
    },
    getDocumentTypes: getDocumentTypes,

    supportedDocumentNumber: function() {
        var PAYU_FACTORY = require("*/cartridge/scripts/utils/PayuFactory");
        var country = PAYU_FACTORY.CONFIGS.COUNTRY;

        if (country === "PAN") {
            return false;
        }

        return true;
    },
};

module.exports = payUHelpers;