'use strict'

var base = require('base/checkout/billing');
var cleave = require('../components/cleave');


var cashPaymentMethods = [
    'PAY_U_CASH',
    'PAGOEFECTIVO',
    'RAPIPAGO',
    'PAGOFACIL',
    'COBRO_EXPRESS',
    'PAGO_EFECTIVO',
    'BOLETO_BANCARIO',
    'OXXO',
    'SPEI',
    'OTHERS_CASH_MX',
    'SEVEN_ELEVEN',
    'BANK_REFERENCED',
    'EFECTY',
    'OTHERS_CASH'
]

function updateIntallmentsDropdown (payment) {
    var selectedPaymentInstrument;
    var selectedCardType;

    var installments = [];
    for (var i=0; i < payment.selectedPaymentInstruments.length; i++) {
        var selectedPI = payment.selectedPaymentInstruments[i];

        if (selectedPI.paymentMethod === 'CREDIT_CARD' || selectedPI.paymentMethod === 'PAY_U') {
            selectedCardType = selectedPI.type;
        }
    }

    if (selectedCardType) {
        for (var i=0; i<payment.applicablePaymentCards.length; i++) {
            var applicableCard = payment.applicablePaymentCards[i];

            if (applicableCard.cardType === selectedCardType) {
                installments = applicableCard.installmentOptions;
            }
        }
    }

    if (installments && installments.length > 0) {
        let installmentSelector = $('#credit-card-content select.installments');

        installmentSelector.empty();
        if (installmentSelector) {
            for (let i=0; i<installments.length; i++) {
                installmentSelector.append(
                    $(
                        '<option>', {
                            value: installments[i],
                            id: installments[i],
                            text: installments[i]
                        }
                    )
                )
            }
        }
    }
}
/**
 * Updates the payment information in checkout, based on the supplied order model
 * @param {Object} order - checkout model to use as basis of new truth
 */
function updatePaymentInformation(order) {
    // update payment details
    var $paymentSummary = $('.payment-details');
    var htmlToAppend = '';

    if (order.billing.payment && order.billing.payment.selectedPaymentInstruments
        && order.billing.payment.selectedPaymentInstruments.length > 0) {
        
            if (order.billing.payment.selectedPaymentInstruments[0].paymentMethod === 'PAY_U' || 
                order.billing.payment.selectedPaymentInstruments[0].paymentMethod === 'CREDIT_CARD'
            ) {
                htmlToAppend += '<span>' + order.resources.cardType + ' '
                + order.billing.payment.selectedPaymentInstruments[0].type
                + '</span><div>'
                + order.billing.payment.selectedPaymentInstruments[0].maskedCreditCardNumber
                + '</div><div><span>'
                + order.resources.cardEnding + ' '
                + order.billing.payment.selectedPaymentInstruments[0].expirationMonth
                + '/' + order.billing.payment.selectedPaymentInstruments[0].expirationYear
                + '</span></div>';
                $paymentSummary.empty().append(htmlToAppend);
                updateIntallmentsDropdown(order.billing.payment);
            } else if (cashPaymentMethods.includes(order.billing.payment.selectedPaymentInstruments[0].paymentMethod)) {
                htmlToAppend = order.payUCashSummaryHTML;
                $paymentSummary.empty().append(htmlToAppend);
                if (order && order.billing.payment 
                    && order.billing.payment.selectedPaymentInstruments
                    && !!order.billing.payment.selectedPaymentInstruments[0].payUCashExpiry
                ) {
                    $('.payu-cash-default-expiry').removeClass('d-none');
                } else {
                    $('.payu-cash-default-expiry').addClass('d-none');
                }
            } else if (order.billing.payment.selectedPaymentInstruments[0].paymentMethod === 'YAPE') {
                htmlToAppend = order.yapeSummary;
                $paymentSummary.empty().append(htmlToAppend);
            }
    }

    // Updated attributes for Supported Cards & Installments
    if (order.billing.payment && order.billing.payment.applicablePaymentCards) {
        $('#credit-card-content fieldset.payment-form-fields').attr('data-supported-cards', JSON.stringify(order.billing.payment.applicablePaymentCards))
    }
}


var exportBase = $.extend({}, base, {
    methods: {
        updateBillingAddressSelector: base.methods.updateBillingAddressSelector,
        updateBillingAddressFormValues: base.methods.updateBillingAddressFormValues,
        clearBillingAddressFormValues: base.methods.clearBillingAddressFormValues,
        updateBillingInformation: base.methods.updateBillingInformation,
        updatePaymentInformation: updatePaymentInformation,
        clearCreditCardForm: base.methods.clearCreditCardForm,
        updateBillingAddress: base.methods.updateBillingAddress,
        validateAndUpdateBillingPaymentInstrument: base.methods.validateAndUpdateBillingPaymentInstrument,
        updateBillingAddressSummary: base.methods.updateBillingAddressSummary
    },

    handleCreditCardNumber: function () {
        cleave.handleCreditCardNumber('.cardNumber', '#cardType');
    },
});



module.exports = exportBase;