'use strict';

var Cleave = require('cleave.js').default;



function updateCardTypeUI(type, cardTypeSelector) {
    var creditCardTypes = {
        visa: 'Visa',
        mastercard: 'Master Card',
        amex: 'Amex',
        discover: 'Discover',
        diners: 'Diners',
        argencard: 'Argencard',
        cabal: 'Cabal',
        cencosud: 'Cencosud',
        naranja: 'Naranja',
        hipercard: 'Hipercard',
        elo: 'Elo',
        unknown: 'Unknown'
    };

    var cardType = creditCardTypes[type] || 'Unknown';
    var applicablePaymentCards = $('#credit-card-content fieldset.payment-form-fields').attr('data-supported-cards');

    if (applicablePaymentCards) {
        var parseApplicableCards = JSON.parse(applicablePaymentCards);
        var supportedCardTypes = parseApplicableCards.map(card=>card.cardType);
        var isSupportedCard = supportedCardTypes.indexOf(cardType) !== -1;
        if (isSupportedCard) {
            $(cardTypeSelector).val(cardType);
            $('.card-number-wrapper').attr('data-type', type);
            var cvvLength = ['amex'].indexOf(type) > -1 ? 4 : 3;
            $('#securityCode').attr('maxlength', cvvLength);
        }
    }
    
}



function detectCardType(number) {
    var cleaned = number.replace(/\D/g, ''); // Remove non-digit characters

    // --- Argentine Cards ---

    // Argencard: BINs 501105 or 532362, 16 digits
    if (/^(501105|532362)\d{10}$/.test(cleaned)) {
        return 'argencard';
    }

    // Cabal
    if (
        /^6042\d{12}$/.test(cleaned) ||
        /^6043\d{12}$/.test(cleaned) ||
        /^604400\d{10}$/.test(cleaned) ||
        /^589657\d{10}$/.test(cleaned) ||
        /^650272(00|0[1-9]|[1-9][0-9])\d{8}$/.test(cleaned) ||
        /^65008700\d{8}$/.test(cleaned)
    ) {
        return 'cabal';
    }

    // Naranja: 589562 + 10 digits
    if (/^589562\d{10}$/.test(cleaned)) {
        return 'naranja';
    }

    // Cencosud: 603493 + 10 digits
    if (/^603493\d{10}$/.test(cleaned)) {
        return 'cencosud';
    }

    // --- Brazilian Cards ---

    // Hipercard: common BINs
    if (
        /^3841(0|4|6|9)/.test(cleaned) ||
        /^60(38[4-9]|39[0-2])/.test(cleaned) ||
        /^606282/.test(cleaned)
    ) {
        return 'hipercard';
    }

    // Elo: subset of known BINs
    if (
        /^(4011(78|79)|431274|438935|451416|457393|504175|5067\d{2}|5090\d{2}|627780|636297|636368)/.test(cleaned)
    ) {
        return 'elo';
    }

    return 'unknown';
}



module.exports = {
    handleCreditCardNumber: function (cardFieldSelector, cardTypeSelector) {
        var cleave = new Cleave(cardFieldSelector, {
            creditCard: true,
            onCreditCardTypeChanged: function (type) {
                var number = $(cardFieldSelector).val();
                if (['unknown', 'maestro'].indexOf(type) > -1) {
                    type = detectCardType(number);
                }
                var creditCardTypes = {
                    visa: 'Visa',
                    mastercard: 'Master Card',
                    amex: 'Amex',
                    discover: 'Discover',
                    diners: 'Diners',
                    argencard: 'Argencard',
                    cabal: 'Cabal',
                    cencosud: 'Cencosud',
                    naranja: 'Naranja',
                    hipercard: 'Hipercard',
                    elo:'Elo',
                    unknown: 'Unknown'
                };
                // consolel
                var cardType = creditCardTypes[Object.keys(creditCardTypes).indexOf(type) > -1 ? type : 'unknown'];
                $(cardTypeSelector).val(cardType);
                $('.card-number-wrapper').attr('data-type', type);

                if (['amex'].indexOf(type) > -1) {
                    $('#securityCode').attr('maxlength', 4);
                } else if (['visa', 'mastercard', 'discover', 'diners', 'argencard', 'cabal', 'cencosud', 'naranja', 'elo', 'hipercard'].indexOf(type) > -1) {
                    $('#securityCode').attr('maxlength', 3);
                }

                // update installments

                var applicableCards = $('#credit-card-content fieldset.payment-form-fields').attr('data-supported-cards');

                if (applicableCards) {
                    var parseApplicableCards = JSON.parse(applicableCards);

                    if (parseApplicableCards && parseApplicableCards.length) {
                        var supportedInstallments
                        for (var i=0; i< parseApplicableCards.length; i++) {
                            if (parseApplicableCards[i].cardType === cardType) {
                                supportedInstallments = parseApplicableCards[i].installmentOptions
                            }
                        }

                        if (supportedInstallments && supportedInstallments.length) {
                            let installmentSelector = $('#credit-card-content select.installments');
                            installmentSelector.empty();

                            for (let j=0; j<supportedInstallments.length; j++) {
                                installmentSelector.append(
                                    $(
                                        '<option>', {
                                            value: supportedInstallments[j],
                                            id: supportedInstallments[j],
                                            text: supportedInstallments[j]
                                        }
                                    )
                                )
                            }
                        } else {
                           // TO-DO - If there is no installment 
                        }
                    }
                }
            }
        });

        $(cardFieldSelector).on('input', function () {
            var number = $(this).val();
            var cleaveType = cleave.properties.creditCardType;
            // If Cleave didn't recognize it, apply local detection
            if (cleaveType === 'unknown' || cleaveType === 'visa' || number.startsWith('603493') || number.startsWith('58') || number.startsWith('603')) {
                var localType = detectCardType(number);
                if (cleaveType !== 'visa') {
                    updateCardTypeUI(localType, cardTypeSelector);
                } else if (cleaveType === 'visa' && localType !== 'unknown') {
                    updateCardTypeUI(localType, cardTypeSelector);
                }
                
            }
        });

        $(cardFieldSelector).data('cleave', cleave);
    },

    serializeData: function (form) {
        var serializedArray = form.serializeArray();

        serializedArray.forEach(function (item) {
            if (item.name.indexOf('cardNumber') > -1) {
                item.value = $('#cardNumber').data('cleave').getRawValue(); // eslint-disable-line
            }
        });

        return $.param(serializedArray);
    }
};
