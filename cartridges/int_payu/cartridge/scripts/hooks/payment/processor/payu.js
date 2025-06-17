
'use strict';

var collections = require('*/cartridge/scripts/util/collections');

var PaymentInstrument = require('dw/order/PaymentInstrument');
var PaymentMgr = require('dw/order/PaymentMgr');
var BasketMgr = require('dw/order/BasketMgr');
var PaymentStatusCodes = require('dw/order/PaymentStatusCodes');
var Resource = require('dw/web/Resource');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var PaymentService = require('*/cartridge/scripts/services/PaymentService');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');

/**
 * Verifies that entered credit card information is a valid card. If the information is valid a
 * credit card payment instrument is created
 * @param {dw.order.Basket} basket Current users's basket
 * @param {Object} paymentInformation - the payment information
 * @param {string} paymentMethodID - paymentmethodID
 * @param {Object} req the request object
 * @return {Object} returns an error object
 */
function Handle(basket, paymentInformation, paymentMethodID, req) {
    var currentBasket = basket;
    var cardErrors = {};
    var cardNumber = paymentInformation.cardNumber.value;
    var cardSecurityCode = paymentInformation.securityCode.value;
    var expirationMonth = paymentInformation.expirationMonth.value;
    var expirationYear = paymentInformation.expirationYear.value;
    var serverErrors = [];
    var creditCardStatus;
    var cardType = paymentInformation.cardType.value;
    var paymentCard = PaymentMgr.getPaymentCard(cardType);

    // Validate payment instrument
    if (paymentMethodID === PaymentInstrument.METHOD_CREDIT_CARD) {
        var creditCardPaymentMethod = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD);
        var paymentCardValue = PaymentMgr.getPaymentCard(paymentInformation.cardType.value);
        var applicablePaymentCards = creditCardPaymentMethod.getApplicablePaymentCards(
            req.currentCustomer.raw,
            req.geolocation.countryCode,
            null
        );

        if (!applicablePaymentCards.contains(paymentCardValue)) {
            // Invalid Payment Instrument
            var invalidPaymentMethod = Resource.msg('error.payment.not.valid', 'checkout', null);
            return { fieldErrors: [], serverErrors: [invalidPaymentMethod], error: true };
        }
    }
    var tokenizeServiceResp
    if (!paymentInformation.creditCardToken) {
        if (paymentCard) {
            creditCardStatus = paymentCard.verify(
                expirationMonth,
                expirationYear,
                cardNumber,
                cardSecurityCode
            );
        } else {
            cardErrors[paymentInformation.cardNumber.htmlName] = Resource.msg('error.invalid.card.number', 'creditCard', null);
            return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
        }

        if (creditCardStatus.error) {
            collections.forEach(creditCardStatus.items, function (item) {
                switch (item.code) {
                    case PaymentStatusCodes.CREDITCARD_INVALID_CARD_NUMBER:
                        cardErrors[paymentInformation.cardNumber.htmlName] = Resource.msg('error.invalid.card.number', 'creditCard', null);
                        break;

                    case PaymentStatusCodes.CREDITCARD_INVALID_EXPIRATION_DATE:
                        cardErrors[paymentInformation.expirationMonth.htmlName] = Resource.msg('error.expired.credit.card', 'creditCard', null);
                        cardErrors[paymentInformation.expirationYear.htmlName] = Resource.msg('error.expired.credit.card', 'creditCard', null);
                        break;

                    case PaymentStatusCodes.CREDITCARD_INVALID_SECURITY_CODE:
                        cardErrors[paymentInformation.securityCode.htmlName] = Resource.msg('error.invalid.security.code', 'creditCard', null);
                        break;
                    default:
                        serverErrors.push(Resource.msg('error.card.information.error', 'creditCard', null));
                }
            });

            return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
        }

        tokenizeServiceResp = payuHelpers.createCardToken(paymentInformation);
        if (tokenizeServiceResp && !tokenizeServiceResp.error) {
            Transaction.wrap(function () {
                var paymentInstruments = currentBasket.getPaymentInstruments();
        
                collections.forEach(paymentInstruments, function (pi) {
                    if (pi.paymentMethod == "PAY_U" || pi.paymentMethod == "PAY_U_CASH" || pi.paymentMethod == "CREDIT_CARD") {
                        currentBasket.removePaymentInstrument(pi);
                    }
                });
        
                var paymentInstrument = currentBasket.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD, currentBasket.totalGrossPrice);
                paymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);
                paymentInstrument.setCreditCardNumber(cardNumber);
                paymentInstrument.setCreditCardType(cardType);
                paymentInstrument.setCreditCardExpirationMonth(expirationMonth);
                paymentInstrument.setCreditCardExpirationYear(expirationYear);
                if (tokenizeServiceResp) {
                    paymentInstrument.setCreditCardToken(tokenizeServiceResp.token);
                }
                // paymentInstrument.custom.payUCardSecurityCode = paymentInformation.securityCode.value;
                paymentInstrument.custom.payUCardSecurityCode = tokenizeServiceResp.encryptedCvv;
                paymentInstrument.custom.payUdeviceSessionId = paymentInformation.deviceSessionId.value;
                paymentInstrument.custom.payUCardInstallments = paymentInformation.installments.value ? paymentInformation.installments.value :  0
            });
        } else {
            Logger.error('Failed to tokenize card: {0}', tokenizeServiceResp.message);
            serverErrors.push(
                Resource.msg('error.card.information.error', 'creditCard', null)
            );
            return { fieldErrors: [cardErrors], serverErrors: serverErrors, error: true };
            // Handle the error (e.g., show a message to the user, retry, etc.)
        }
    } else if (paymentInformation.creditCardToken) {
        
        Transaction.wrap(function () {
            var paymentInstruments = basket.paymentInstruments;
    
            collections.forEach(paymentInstruments, function (item) {
                currentBasket.removePaymentInstrument(item);
            });
    
            var paymentInstrument = currentBasket.createPaymentInstrument(PaymentInstrument.METHOD_CREDIT_CARD, currentBasket.totalGrossPrice);
            paymentInstrument.setCreditCardHolder(currentBasket.billingAddress.fullName);
            paymentInstrument.setCreditCardNumber(cardNumber);
            paymentInstrument.setCreditCardType(cardType);
            paymentInstrument.setCreditCardExpirationMonth(expirationMonth);
            paymentInstrument.setCreditCardExpirationYear(expirationYear);
            paymentInstrument.setCreditCardToken(paymentInformation.creditCardToken);
            paymentInstrument.custom.payUCardSecurityCode = paymentInformation.securityCode.value;
        });

    }




    
    
    

    return { fieldErrors: cardErrors, serverErrors: serverErrors, error: false };
}

/**
 * Authorizes a payment using a credit card. Customizations may use other processors and custom
 *      logic to authorize credit card payment.
 * @param {number} orderNumber - The current order's number
 * @param {dw.order.PaymentInstrument} paymentInstrument -  The payment instrument to authorize
 * @param {dw.order.PaymentProcessor} paymentProcessor -  The payment processor of the current
 *      payment method
 * @return {Object} returns an error object
 */
function Authorize(orderNumber, paymentInstrument, paymentProcessor, order) {
    // Implement PayU-specific authorization logic
    var paymentId = paymentInstrument.custom.payUPaymentId;
    var token = paymentInstrument.creditCardToken;
    var payUCardSecurityCode = paymentInstrument.custom.payUCardSecurityCode;
    var authorizationResult = payuHelpers.authorizePayment(paymentId, order, token, payUCardSecurityCode);
    return authorizationResult;
}

function Charge(orderNumber, paymentInstrument, paymentProcessor, order) {
    var paymentId = paymentInstrument.custom.payUPaymentId;
    var token = paymentInstrument.creditCardToken;
    var payUCardSecurityCode = paymentInstrument.custom.payUCardSecurityCode;
    var chargeResult = payuHelpers.chargeCard(paymentId, order, token, payUCardSecurityCode);
    return chargeResult;
}

exports.Handle = Handle;
exports.Authorize = Authorize;
exports.Charge = Charge;
