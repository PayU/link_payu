'use strict';

var PaymentMgr = require('dw/order/PaymentMgr');
var PaymentInstrument = require('dw/order/PaymentInstrument');
var collections = require('*/cartridge/scripts/util/collections');
var formatMoney = require('dw/util/StringUtils').formatMoney;
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var Site = require('dw/system/Site');
var Calendar = require('dw/util/Calendar');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');

/**
 * Creates an array of objects containing applicable payment methods
 * @param {dw.util.ArrayList<dw.order.dw.order.PaymentMethod>} paymentMethods - An ArrayList of
 *      applicable payment methods that the user could use for the current basket.
 * @returns {Array} of object that contain information about the applicable payment methods for the
 *      current cart
 */
function applicablePaymentMethods(paymentMethods) {
    return collections.map(paymentMethods, function (method) {
        return {
            ID: method.ID,
            name: method.name,
            country: PayUFactory.CONFIGS.COUNTRY
        };
    });
}
var supportedCards = [
    'Visa',
    'Amex',
    'Master Card',
    'Diners',
    'Argencard',
    'Cabal',
    'Cencosud',
    'Naranja'
]
/**
 * Creates an array of objects containing applicable credit cards
 * @param {dw.util.Collection<dw.order.PaymentCard>} paymentCards - An ArrayList of applicable
 *      payment cards that the user could use for the current basket.
 * @returns {Array} Array of objects that contain information about applicable payment cards for
 *      current basket.
 */
function applicablePaymentCards(paymentCards) {

    var cardWiseInstallmentOptions = payuHelpers.getCardWiseInstallments();


    return collections.map(paymentCards, function (card) {

        var result = {
            cardType: card.cardType,
            name: card.name
        };


        if (supportedCards.includes(card.cardType) && cardWiseInstallmentOptions) {
            result.installmentOptions = cardWiseInstallmentOptions[card.cardType];
        }

        return result;
    });
}

/**
 * Creates an array of objects containing selected payment information
 * @param {dw.util.ArrayList<dw.order.PaymentInstrument>} selectedPaymentInstruments - ArrayList
 *      of payment instruments that the user is using to pay for the current basket
 * @returns {Array} Array of objects that contain information about the selected payment instruments
 */
function getSelectedPaymentInstruments(selectedPaymentInstruments) {
    return collections.map(selectedPaymentInstruments, function (paymentInstrument) {
        var results = {
            paymentMethod: paymentInstrument.paymentMethod,
            amount: paymentInstrument.paymentTransaction.amount.value,
            formattedAmount : formatMoney(paymentInstrument.paymentTransaction.amount),
            payUCashExpiry: ''
        };
        if (paymentInstrument.paymentMethod === 'CREDIT_CARD') {
            results.lastFour = paymentInstrument.creditCardNumberLastDigits;
            results.owner = paymentInstrument.creditCardHolder;
            results.expirationYear = paymentInstrument.creditCardExpirationYear;
            results.type = paymentInstrument.creditCardType;
            results.maskedCreditCardNumber = paymentInstrument.maskedCreditCardNumber;
            results.expirationMonth = paymentInstrument.creditCardExpirationMonth;
        } else if (paymentInstrument.paymentMethod === 'GIFT_CERTIFICATE') {
            results.giftCertificateCode = paymentInstrument.giftCertificateCode;
            results.maskedGiftCertificateCode = paymentInstrument.maskedGiftCertificateCode;
        }

        if (PayUFactory.isCashPaymentMethod(paymentInstrument.paymentMethod)) {
            results.payUCashExpiry = PayUFactory.CONFIGS.PAYU_CASH_EXPIRY;
            results.country = PayUFactory.CONFIGS.COUNTRY;
        }

        return results;
    });
}

function formatTimestamp(timestamp) {
    var siteTimezone = Site.getCurrent().getTimezone(); // Get BM configured timezone (e.g., GMT+5)

    var date = new Date(parseInt(timestamp)); // Convert to JavaScript Date
    var calendar = new Calendar(date); // Initialize Calendar
    calendar.setTimeZone(siteTimezone); // Apply Site Timezone

    var day = String(calendar.get(Calendar.DATE)).padStart(2, '0');
    var month = String(calendar.get(Calendar.MONTH) + 1).padStart(2, '0'); // Months are 0-based
    var year = calendar.get(Calendar.YEAR);

    var hours = calendar.get(Calendar.HOUR); // Get 12-hour format (1-12)
    var minutes = String(calendar.get(Calendar.MINUTE)).padStart(2, '0');
    var seconds = String(calendar.get(Calendar.SECOND)).padStart(2, '0');

    // Check if it's AM or PM correctly
    var amPm = (calendar.get(Calendar.AM_PM) === 1) ? "PM" : "AM";

    // Ensure 12-hour format displays correctly (0 should be 12)
    if (hours === 0) {
        hours = 12;
    }

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds} ${amPm}`;
}

/**
 * Retrieves PayU Cash payment details from a payment instrument.
 * @param {dw.order.PaymentInstrument} paymentInstrument - The payment instrument object.
 * @returns {Object|null} PayU Cash payment details or null if not applicable.
 */
function getPayUCashInfo(paymentInstrument) {
    if (paymentInstrument && PayUFactory.isCashPaymentMethod(paymentInstrument.paymentMethod)) {
        var payUCashInfo = {
            payUCashReceiptPdfUrl: paymentInstrument.custom.payUCashReceiptPdfUrl || "",
            payUCashReceiptHtmlUrl: paymentInstrument.custom.payUCashReceiptHtmlUrl || "",
            payUCIP: paymentInstrument.custom.payUCIP || "",
            payUCashExpiry: paymentInstrument.custom.payUCashExpiry || '',
            payUCashExpiration: paymentInstrument.custom.payUCashExpiration || '',
            payUExternalId: paymentInstrument.custom.payUOrderId,
            payUCashExpirationFormatted: paymentInstrument.custom.payUCashExpiration ? formatTimestamp(paymentInstrument.custom.payUCashExpiration) : ''
        };

        if (paymentInstrument && paymentInstrument.paymentMethod === 'SPEI' && paymentInstrument.custom.payUCashExpiration) {
            payUCashInfo.payUCashExpirationFormatted = paymentInstrument.custom.payUCashExpiration;
        }
        return payUCashInfo;
    }
    return null;
}

/**
 * Payment class that represents payment information for the current basket
 * @param {dw.order.Basket} currentBasket - the target Basket object
 * @param {dw.customer.Customer} currentCustomer - the associated Customer object
 * @param {string} countryCode - the associated Site countryCode
 * @constructor
 */
function Payment(currentBasket, currentCustomer, countryCode) {
    var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
    var paymentAmount = currentBasket.totalGrossPrice;
    var paymentMethods = PaymentMgr.getApplicablePaymentMethods(
        currentCustomer,
        countryCode,
        paymentAmount.value
    );
    var paymentCards = PaymentMgr.getPaymentMethod(PaymentInstrument.METHOD_CREDIT_CARD)
        .getApplicablePaymentCards(currentCustomer, countryCode, paymentAmount.value);
    var paymentInstruments = currentBasket.paymentInstruments;
    var paymentInstrument = currentBasket.paymentInstrument;

    // TODO: Should compare currentBasket and currentCustomer and countryCode to see
    //     if we need them or not
    this.applicablePaymentMethods = paymentMethods ? applicablePaymentMethods(paymentMethods) : null;

    this.applicablePaymentCards = paymentCards ? applicablePaymentCards(paymentCards) : null;

    this.selectedPaymentInstruments = paymentInstruments
        ? getSelectedPaymentInstruments(paymentInstruments) : null;

    this.payUCash = paymentInstrument ? getPayUCashInfo(paymentInstrument) : null;

    if (currentBasket.custom.pay_u_payment_status) {
        this.payUPaymentStatus = currentBasket.custom.pay_u_payment_status;
    }
}

module.exports = Payment;
