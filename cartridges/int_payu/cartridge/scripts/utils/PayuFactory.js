'use strict';

var Logger = require('dw/system/Logger');
var Site = require('dw/system/Site');
var Calendar = require('dw/util/Calendar');

function getCurrentDateISO(days) {
    try {
        var siteTimezone = Site.getCurrent().getTimezone(); // Get BM Configured Timezone (e.g., GMT+5)
        var calendar = new Calendar();
        calendar.setTimeZone(siteTimezone); // Apply Site Timezone

        if (days) {
            calendar.add(Calendar.DATE, days); // Add 7 days
        }

        var year = calendar.get(Calendar.YEAR);
        var month = String(calendar.get(Calendar.MONTH) + 1).padStart(2, '0'); // Months are 0-based
        var day = String(calendar.get(Calendar.DATE)).padStart(2, '0');
        var hours = String(calendar.get(Calendar.HOUR_OF_DAY)).padStart(2, '0');
        var minutes = String(calendar.get(Calendar.MINUTE)).padStart(2, '0');
        var seconds = String(calendar.get(Calendar.SECOND)).padStart(2, '0');

        // Get timezone offset in hours and minutes (e.g., "-05:00")
        var timeZoneOffset = siteTimezone.getOffset(calendar) / (60 * 1000); // Offset in minutes
        var tzHours = String(Math.floor(Math.abs(timeZoneOffset) / 60)).padStart(2, '0');
        var tzMinutes = String(Math.abs(timeZoneOffset) % 60).padStart(2, '0');
        var timeZoneString = (timeZoneOffset < 0 ? '-' : '+') + tzHours + ':' + tzMinutes;

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${timeZoneString}`;
    } catch (e) {
        Logger.error('Error:getCurrentDateISO(): {0}', JSON.stringify(e));
    }
}
/**
 * Converts a 2-letter ISO country code to a 3-letter ISO country code.
 *  If the input is already a 3-letter code, returns it unchanged.
 *
 * @param {string} twoLetterCode - The 2-letter ISO country code (e.g., "PE").
 * @returns {string|null} The 3-letter ISO country code (e.g., "PER") or null if not found.
 */
function convertToISO3CountryCode(countryCode) {

    if (!countryCode || typeof countryCode !== 'string') {
        return null;
    }

    if (countryCode.length === 3) {
        return countryCode.toUpperCase();
    }
    var mapping = {
        PE: 'PER',
        AR: 'ARG',
        BR: 'BRA',
        CL: 'CHL',
        CO: 'COL',
        MX: 'MEX',
        PA: 'PAN',
        AU: 'AUS',
        AT: 'AUT',
        CA: 'CAN',
        CN: 'CHN',
        DK: 'DNK',
        EG: 'EGY',
        FR: 'FRA',
        DE: 'DEU',
        IN: 'IND',
        ID: 'IDN',
        IT: 'ITA',
        JP: 'JPN',
        NL: 'NLD',
        NZ: 'NZL',
        PH: 'PHL',
        PL: 'POL',
        PT: 'PRT',
        RU: 'RUS',
        SA: 'SAU',
        SG: 'SGP',
        ES: 'ESP',
        SE: 'SWE',
        CH: 'CHE',
        TH: 'THA',
        TR: 'TUR',
        GB: 'GBR',
        UY: 'URY',
        VE: 'VEN'
    };

    return mapping[countryCode.toUpperCase()] || null;
}

function isCashPaymentMethod (paymentMethodId) {
    var cashPaymentMethods = [
        "PAY_U_CASH", 'PAGOEFECTIVO', "BOLETO_BANCARIO", "COBRO_EXPRESS", 
        "PAGOFACIL", "RAPIPAGO", "OXXO", "SEVEN_ELEVEN", 
        "SPEI", "OTHERS_CASH_MX", "BANK_REFERENCED", "EFECTY",
        "OTHERS_CASH"
    ];
    return cashPaymentMethods.includes(paymentMethodId);
}
function get3dsValue(type) {
    const threeDsValues = {
        'ENABLED': 'true',
        'DISABLED': 'false',
        'INTERNAL': '""',
    }
    return threeDsValues[type];
}
var PayUFactory = {
    CONSTANTS: {
        WEBHOOK_DELAY: 3 // in seconds
    },
    ACTIONS: {
        CREATE_CC_TOKEN: 'create-cc-token',
        CREATE_PAYMENT: 'create-payment',
        AUTHORIZATION: 'authorization',
        CAPTURE: 'capture',
		CARD_CVV_CODE: 'card_cvv_code',
        CHARGE_PAYU_CASH: 'CHARGE_PAYU_CASH',
        CHARGE: 'CHARGE'
    },

	STATUS: {
        RESPONSE: {
            SUCCEED: 'Succeed',
            PENDING: 'Pending',
            FAILED: 'Failed',
        },
		PAYMENT: {
			INITIALIZED: 'Initialized',
			AUTHORIZED: 'AUTHORIZED',
			CAPTURED: 'CAPTURED',
			REFUND: 'REFUND',
		},
        PROVIDER_RESPONSE: {
            PENDING_TRANSACTION_REVIEW: 'PENDING_TRANSACTION_REVIEW',
            APPROVED: 'APPROVED',
            THREEDS_REJECTED: 'THREEDS_REJECTED',
            PENDING_THREEDS_CALLBACK: 'PENDING_THREEDS_CALLBACK'
        }
	},

    PAYMENT_STATUS: {
        INITIALIZED: 'Initialized',
        CAPTURED: 'Captured',
        AUTHORIZED: 'Authorized',
        REFUNDED: 'Refunded',
        VOIDED: 'Voided',
        PENDING: 'Pending',
        TIMEOUT: 'Timeout'
    },

    CONFIGS: {
        PUBLIC_KEY: Site.getCurrent().getCustomPreferenceValue('payUPublicKey') || null,
        PRIVATE_KEY: Site.getCurrent().getCustomPreferenceValue('payUPrivateKey') || null,
        APP_ID: Site.getCurrent().getCustomPreferenceValue('payUAppId') || null,
        ENVIRONMENT: Site.getCurrent().getCustomPreferenceValue('payUEnvironment') || 'test',
        API_VERSION: Site.getCurrent().getCustomPreferenceValue('payUApiVersion') || '1.3.0',
        PROVIDER: Site.getCurrent().getCustomPreferenceValue('payUProvider'),
        PAYU_CASH_EXPIRY: Site.getCurrent().getCustomPreferenceValue('payUCashExpiryDays').value || 7,
        INSTALLMENTS: Site.getCurrent().getCustomPreferenceValue('payUInstallments') || [],
        ENABLE_IMMEDIATE_CAPTURE: Site.getCurrent().getCustomPreferenceValue('enableImmediateCapture') || false,
        LANGUAGE: Site.getCurrent().getCustomPreferenceValue('payULanguage').value || 'en',
        INSTALLMENTS_ENABLED: Site.getCurrent().getCustomPreferenceValue('payUEnableInstallments') || false, 
        COUNTRY: Site.getCurrent().getCustomPreferenceValue('payUCountry').value || null, 
        THREE_D_S_CONFIG: Site.getCurrent().getCustomPreferenceValue('payu3DSConfiguration') || 'DISABLED',
        IS_VOID_ALLOWED: Site.getCurrent().getCustomPreferenceValue('payUVoidAllowed') || false,
        PAYMENT_FLOW: Site.getCurrent().getCustomPreferenceValue('payUPaymentFlowType'),
        SUPPORTED_DOCUMENT_TYPES: Site.getCurrent().getCustomPreferenceValue('payUSupportedDocumentTypes') || "{}",
        CARD_WISE_INSTALLMENTS: Site.getCurrent().getCustomPreferenceValue('payUCardWiseInstallments') || "{}"
    },
    PAYMENT_METHODS: {
        BANK_REFERENCED: 'BANK_REFERENCED',
        BOLETO_BANCARIO: 'BOLETO_BANCARIO',
        COBRO_EXPRESS: 'COBRO_EXPRESS',
        EFECTY: 'EFECTY',
        OTHERS_CASH_MX: 'OTHERS_CASH_MX',
        OTHERS_CASH: 'OTHERS_CASH',
        OXXO: 'OXXO',
        PAGOEFECTIVO: 'PAGOEFECTIVO',
        PAGOFACIL: 'PAGOFACIL',
        RAPIPAGO: 'RAPIPAGO',
        SEVEN_ELEVEN: 'SEVEN_ELEVEN',
        SPEI: 'SPEI',
        YAPE: 'YAPE'
    },
    WEBHOOK_EVENTS: {
        CHARGE: {
            CREATE: 'payment.charge.create',
            UPDATE: 'payment.charge.update'
        },

        CAPTURE: {
            CREATE: 'payment.capture.create',
            UPDATE: 'payment.capture.update'
        },

        REFUND: {
            CREATE: 'payment.refund.create',
            UPDATE: 'payment.refund.update'
        },

        VOID: {
            CREATE: 'payment.void.create',
            UPDATE: 'payment.void.update'
        },
        AUTHORIZATION: {
            CREATE: 'payment.authorization.create',
            UPDATE: 'payment.authorization.update'
        }
    },

    getLogger: function(method) {
        return Logger.getLogger('PAYU');
    },

    getDefaultInstallmentValue: function() {
        var countryCode = this.CONFIGS.COUNTRY;

        if (countryCode === 'PER') return 0;
        return 1;
    }, 
    buildCreateTokenRequestContainer: function(paymentInformation) {
        var requestDataContainer = {
            path: '/tokens',
            action: this.ACTIONS.CREATE_CC_TOKEN,
            requestMethod: 'POST',
            data: {
				token_type: 'credit_card',
                holder_name: paymentInformation.cardOwner.value,
                card_number: paymentInformation.cardNumber.value,
                expiration_date: paymentInformation.expirationMonth.value.toString().padStart(2, '0') + '/' + paymentInformation.expirationYear.value,
                credit_card_cvv: paymentInformation.securityCode.value
            }
        }

        if (this.CONFIGS.COUNTRY !== 'PAN') {
            requestDataContainer.data.identity_document = {
                type: paymentInformation.documentType.value ? paymentInformation.documentType.value : '',
                number: paymentInformation.documentNumber && paymentInformation.documentNumber.value ? paymentInformation.documentNumber.value.toString() : ''
            }
        }
        return requestDataContainer;
    },
	buildRetrieveCustomerRequestContainer: function(customerId) {
		var requestDataContainer = {
			path: '/customers/' + customerId,
			requestMethod: 'GET'
		};
		return requestDataContainer;
	}, 
	buildSavedCardTokenRequestContainer: function (cardToken, securityCode) {
		var requestDataContainer = {
			path: '/tokens',
			requestMethod: 'POST',
			action: this.ACTIONS.CARD_CVV_CODE,
			data: {
				token_type: 'card_cvv_code',
				payment_method_token: cardToken,
				credit_card_cvv: securityCode
			}
		}
		return requestDataContainer;
	},
	buildRetrievePaymentRequestContainer: function(paymentId) {
		var requestDataContainer = {
			path: '/payments/' + paymentId,
			requestMethod: 'GET'
		}
		return requestDataContainer;
	},

    buildRetrieveAuthorizationRequestContainer: function (authorizationId, paymentId) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/authorizations/' + authorizationId,
            requestMethod: 'GET'
        }
        return requestDataContainer;
    },
    convertToMinorUnits: function(amount) {
        var convertedMinorUnitAmount = amount;
        var countryCode = this.CONFIGS.COUNTRY;
        if (countryCode === 'CHL') return convertedMinorUnitAmount

        return convertedMinorUnitAmount * 100;
    },

    convertToMajorUnits: function(amount) {
        var convertedMajorUnitAmount = amount;
        var countryCode = this.CONFIGS.COUNTRY;
        if (countryCode === 'PER' || countryCode === 'BRA') {
            convertedMajorUnitAmount = convertedMajorUnitAmount / 100;
        }
        return convertedMajorUnitAmount;
    },

    getBillingPhoneNumber: function (phoneNumber) {
        if (this.CONFIGS.COUNTRY === 'MEX') return "" + phoneNumber;
        return phoneNumber;
    },


    buildCreatePaymentRequestContainer: function(order) {
        var requestDataContainer = {
            path: '/payments',
            action: this.ACTIONS.CREATE_PAYMENT,
            requestMethod: 'POST',
            data: {
                // amount: order.totalGrossPrice.value * 100, // Convert to minor
                amount: this.convertToMinorUnits(order.totalGrossPrice.value), // Convert to minor
                currency: order.currencyCode,
                statement_soft_descriptor: 'Order Payment',
                order: {
                    id: order.orderNo,
                    tax_amount: this.convertToMinorUnits(order.totalTax.value),
                    sub_total: this.convertToMinorUnits(order.totalNetPrice.value),
                    tax_percentage: (order.totalTax.value / order.totalNetPrice.value)
                },
                shipping_address: {
                    country: convertToISO3CountryCode(order.defaultShipment.shippingAddress.countryCode.value),
                    state: order.defaultShipment.shippingAddress.stateCode,
                    city: order.defaultShipment.shippingAddress.city,
                    line1: order.defaultShipment.shippingAddress.address1,
                    line2: order.defaultShipment.shippingAddress.address2 || '',
                    zip_code: order.defaultShipment.shippingAddress.postalCode,
                    first_name: order.defaultShipment.shippingAddress.firstName,
                    last_name: order.defaultShipment.shippingAddress.lastName,
                    email: order.customerEmail,
                    phone: order.defaultShipment.shippingAddress.phone
                },
                billing_address: {
                    country: convertToISO3CountryCode(order.billingAddress.countryCode.value),
                    state: order.billingAddress.stateCode,
                    city: order.billingAddress.city,
                    line1: order.billingAddress.address1,
                    line2: order.billingAddress.address2 || '',
                    zip_code: order.billingAddress.postalCode,
                    first_name: order.billingAddress.firstName,
                    last_name: order.billingAddress.lastName,
                    email: order.customerEmail,
                    phone: this.getBillingPhoneNumber(order.billingAddress.phone)
                }
            }
        }

        return requestDataContainer;
    },
    buildAuthorizePaymentRequestContainer: function(paymentId, order, token, cvv) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/authorizations',
            action: this.ACTIONS.AUTHORIZATION,
            requestMethod: 'POST',
            data: {
                installments: {
                    number_of_installments: (this.CONFIGS.INSTALLMENTS_ENABLED && order.paymentInstrument.custom.payUCardInstallments) ? order.paymentInstrument.custom.payUCardInstallments : this.getDefaultInstallmentValue()
                },
                additional_details: {
                    number_of_installments: (this.CONFIGS.INSTALLMENTS_ENABLED && order.paymentInstrument.custom.payUCardInstallments) ? order.paymentInstrument.custom.payUCardInstallments : this.getDefaultInstallmentValue()
                },
                payment_method: {
                    type: "tokenized",
                    token: token, // Tokenized card payment
                    credit_card_cvv: cvv, // Required CVV for authorization
                },
                channel_type: "web_order",
                cof_transaction_indicators: {
                    card_entry_mode: "consent_transaction"
                },
                provider_specific_data: {
                    payu_latam: {
                        additional_details: {
                            order_language: this.CONFIGS.LANGUAGE,
                            process_without_cvv2: false,
                            payer_email: order.customerEmail,
                            merchant_payer_id: order.customerNo || '000000',
                            cookie: session.sessionID
                        },
                        device_fingerprint: {
                            fingerprint: order.paymentInstrument.custom.payUdeviceSessionId,
                            provider: this.CONFIGS.PROVIDER
                        }
                    }
                },
				reconciliation_id: order.UUID
            }
        }

        if (order.billingAddress.custom.documentType === 'CNPJ') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_cnpj_identify_number = order.billingAddress.custom.documentNumber;
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
        } else if (this.CONFIGS.COUNTRY !== 'PAN') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_number = order.billingAddress.custom.documentNumber;
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
        }

        // Validations for 3ds 
        if (this.CONFIGS.THREE_D_S_CONFIG.value !== 'DISABLED') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.is3ds = get3dsValue(this.CONFIGS.THREE_D_S_CONFIG);
            var URLUtils = require('dw/web/URLUtils');
            requestDataContainer.data.merchant_site_url = URLUtils.https('PayU-Handle3DS').toString();
        }
		return requestDataContainer;
    },

	buildCapturePaymentRequestContainer: function(paymentId) {
		var requestDataContainer = {
			path: '/payments/' + paymentId + '/captures',
			requestMethod: 'POST',
			action: this.ACTIONS.CAPTURE
		}
		return requestDataContainer;
	},

	buildCreateCustomerRequestContainer: function(customer) {
		var requestDataContainer = {
			path: '/customers',
			requestMethod: 'POST',
			data: {
				customer_reference: customer.profile.customerNo,
				first_name: customer.profile.firstName,
				last_name: customer.profile.lastName,
				email: customer.profile.email
			}
		}

		return requestDataContainer;
	},

	buildCreatePaymentMethodRequestContainer: function(customerId, cardToken) {
		var requestDataContainer = {
			path: '/customers/' + customerId + '/payment-methods/' + cardToken,
			requestMethod: 'POST'
		}
		return requestDataContainer;
	},

    buildRefundRequestContainer: function (paymentId, refundReason) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/refunds',
            data: {
                refund_reason: refundReason
            },
            requestMethod: 'POST'
        }
        return requestDataContainer;
    },

    buildPartialRefundRequestContainer: function (paymentId, amount, refundReason) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/refunds',
            data: {
                amount: amount,
                refund_reason: refundReason
            },
            requestMethod: 'POST'
        }
        return requestDataContainer;
    },

    buildChargeRequestContainer: function (order, paymentMethod, ipKey) {
        var requestDataContainer;
        if (paymentMethod === 'YAPE') {
            requestDataContainer = {
                path: '/payments/' + order.paymentInstrument.custom.payUPaymentId + '/charges',
                requestMethod: 'POST',
                charge: this.ACTIONS.CHARGE,
                ipKey: ipKey || '',
                data: {
                    payment_method: {
                        vendor: 'YAPE',
                        type: 'untokenized',
                        source_type: 'eWallet',
                        additional_details: {
                            order_language: this.CONFIGS.LANGUAGE,
                            payment_country: 'PER',
                            merchant_payer_id: order.orderNo,
                            payer_email: order.customerEmail,
                            payer_phone: order.paymentInstrument.custom.yapePhoneNumber,
                            authorization_code: order.paymentInstrument.custom.yapeCode,
                        }
                    },
                    reconciliation_id: order.UUID
                }
            }

        } else if (isCashPaymentMethod(paymentMethod)) {
            requestDataContainer = {
                path: '/payments/' + order.paymentInstrument.custom.payUPaymentId + '/charges',
                requestMethod: 'POST',
                charge: this.ACTIONS.CHARGE_PAYU_CASH,
                ipKey: ipKey || '',
                data: {
                    payment_method: {
                        vendor: paymentMethod,
                        type: 'untokenized',
                        source_type: 'cash',
                        additional_details: {
                            order_language: this.CONFIGS.LANGUAGE,
                            payment_country: this.CONFIGS.COUNTRY,
                            payer_email: order.customerEmail,
                            cash_payment_method_vendor: paymentMethod,
                            expiration_date: getCurrentDateISO(this.CONFIGS.PAYU_CASH_EXPIRY),
                        }
                    },
                    provider_specific_data: {
                        payu_latam: {
                            additional_details: {
                                merchant_payer_id: order.customer.registered ? order.customer.profile.customerNo : order.customer.ID
                            }
                        }
                    },
                    reconciliation_id: order.UUID
                }
            }

            if (order.billingAddress.custom.documentType === 'CNPJ') {
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_cnpj_identify_number = order.billingAddress.custom.documentNumber;
            } else if (this.CONFIGS.COUNTRY !== 'PAN') {
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_number = order.billingAddress.custom.documentNumber;
            }
        } else {
            requestDataContainer = {
                path: '/payments/' + order.paymentInstrument.custom.payUPaymentId + '/charges',
                requestMethod: 'POST',
                charge: this.ACTIONS.CHARGE_PAYU_CASH,
                ipKey: ipKey || '',
                data: {
                    payment_method: {
                        vendor: 'PAGOEFECTIVO',
                        type: 'untokenized',
                        source_type: 'cash',
                        additional_details: {
                            order_language: this.CONFIGS.LANGUAGE,
                            payment_country: this.CONFIGS.COUNTRY,
                            payer_email: order.customerEmail,
                            cash_payment_method_vendor: 'PAGOEFECTIVO',
                            expiration_date: getCurrentDateISO(this.CONFIGS.PAYU_CASH_EXPIRY),
                        }
                    },
                    provider_specific_data: {
                        payu_latam: {
                            additional_details: {
                                merchant_payer_id: order.customer.registered ? order.customer.profile.customerNo : order.customer.ID
                            }
                        }
                    },
                    reconciliation_id: order.orderNo
                }
            }
            if (order.billingAddress.custom.documentType === 'CNPJ') {
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_cnpj_identify_number = order.billingAddress.custom.documentNumber;
            } else if (this.CONFIGS.COUNTRY !== 'PAN') {
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
                requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_number = order.billingAddress.custom.documentNumber;
            }
        }
        return requestDataContainer;
    },

    buildChargeCardRequestContainer: function(paymentId, order, token, cvv) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/charges',
            requestMethod: 'POST',
            data: {
                installments: {
                    number_of_installments: (this.CONFIGS.INSTALLMENTS_ENABLED && order.paymentInstrument.custom.payUCardInstallments) ? order.paymentInstrument.custom.payUCardInstallments : this.getDefaultInstallmentValue()
                },
                additional_details: {
                    number_of_installments: (this.CONFIGS.INSTALLMENTS_ENABLED && order.paymentInstrument.custom.payUCardInstallments) ? order.paymentInstrument.custom.payUCardInstallments : this.getDefaultInstallmentValue()
                },
                payment_method: {
                    type: "tokenized",
                    token: token, // Tokenized card payment
                    credit_card_cvv: cvv, // Required CVV for authorization
                },
                channel_type: "web_order",
                cof_transaction_indicators: {
                    card_entry_mode: "consent_transaction"
                },
                provider_specific_data: {
                    payu_latam : {
                        additional_details: {
                            order_language: this.CONFIGS.LANGUAGE,
                            process_without_cvv2: false,
                            payer_email: order.customerEmail,
                            merchant_payer_id: order.customerNo || '', // need to update
                            cookie: session.sessionID, // Example: Using session ID as a tracking cookie
                            is3ds: 'false'
                        },
                        device_fingerprint: {
                            fingerprint: order.paymentInstrument.custom.payUdeviceSessionId,
                            provider: this.CONFIGS.PROVIDER
                        }
                    }
                },
                reconciliation_id: order.orderNo
            }
        };

        if (order.billingAddress.custom.documentType === 'CNPJ') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_cnpj_identify_number = order.billingAddress.custom.documentNumber;
        } else if (this.CONFIGS.COUNTRY !== 'PAN') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_type = order.billingAddress.custom.documentType;
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.customer_national_identify_number = order.billingAddress.custom.documentNumber;
        }

        if (this.CONFIGS.THREE_D_S_CONFIG.value !== 'DISABLED') {
            requestDataContainer.data.provider_specific_data.payu_latam.additional_details.is3ds = get3dsValue(this.CONFIGS.THREE_D_S_CONFIG);
            var URLUtils = require('dw/web/URLUtils');
            requestDataContainer.data.merchant_site_url = URLUtils.https('PayU-Handle3DS').toString();
        }
        return requestDataContainer;
    },

    buildVoidRequestContainer: function (paymentId) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/voids',
            requestMethod: 'POST'
        }
        return requestDataContainer;
    },

    buildRetrieveRefundsRequestContainer: function (paymentId) {
        var requestDataContainer = {
            path: '/payments/' + paymentId + '/refunds/',
            requestMethod: 'GET'
        }
        return requestDataContainer;
    },
    isCashPaymentMethod: isCashPaymentMethod
}

module.exports = PayUFactory;