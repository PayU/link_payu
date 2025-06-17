'use strict';

var page = module.superModule;
var server = require('server');
var BasketMgr = require('dw/order/BasketMgr');
var Transaction = require('dw/system/Transaction');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');
var Resource = require('dw/web/Resource');
var renderTemplateHelper = require('*/cartridge/scripts/renderTemplateHelper');
server.extend(page);


server.prepend(
    'SubmitPayment',
    server.middleware.https,
    csrfProtection.validateAjaxRequest,
    function (req, res, next) {
        var HookManager = require('dw/system/HookMgr');
        var paymentForm = server.forms.getForm('billing');
        var billingFormErrors = {};
        var creditCardErrors = {};
        var paymentFieldErrors = {};
        var paramMap = request.httpParameterMap;
        var billingUserFieldErrors = {};
        var viewData = {};
        var Site = require('dw/system/Site');
        var currentBasket = BasketMgr.getCurrentBasket();
        var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');

        var Locale = require('dw/util/Locale');
        var currentLocale = Locale.getLocale(req.locale.id);
        var OrderModel = require('*/cartridge/models/order');
        var formFieldErrors = [];


        if (formFieldErrors.length) {
            // respond with form data and errors
            res.json({
                form: paymentForm,
                fieldErrors: formFieldErrors,
                serverErrors: [],
                error: true
            });
            return next();
        }

        var isCardPayment = paymentForm.paymentMethod.value === 'PAY_U' || paymentForm.paymentMethod.value === 'CREDIT_CARD'
        // verify billing form data
        billingFormErrors = COHelpers.validateBillingForm(paymentForm.addressFields);

        if (!req.form.storedPaymentUUID && paymentForm.paymentMethod.value.equals('CREDIT_CARD')) {
            // verify credit card form data
            if (!paymentForm.creditCardFields.encryptedData || !paymentForm.creditCardFields.encryptedData.value) {
                creditCardErrors = COHelpers.validateFields(paymentForm.creditCardFields);
                if (!paymentForm.paymentMethod.value) {
                    if (BasketMgr.getCurrentBasket().totalGrossPrice.value > 0) {
                        creditCardErrors[paymentForm.paymentMethod.htmlName] = Resource.msg('error.no.selected.payment.method', 'creditCard', null);
                    }
                }
            }
            if (paymentForm.creditCardFields.securityCode.value === null) {
                creditCardErrors[paymentForm.creditCardFields.securityCode.htmlName] = Resource.msg('error.card.info.invalid.cvv', 'forms', null);
            }
        }

        if (Object.keys(billingUserFieldErrors).length) {
            Object.keys(billingUserFieldErrors).forEach(function (innerKey) {
                creditCardErrors[innerKey] = billingUserFieldErrors[innerKey];
            });
        }
        if (Object.keys(paymentFieldErrors).length) {
            Object.keys(paymentFieldErrors).forEach(function (innerKey) {
                creditCardErrors[innerKey] = paymentFieldErrors[innerKey];
            });
        }

        if (Object.keys(billingFormErrors).length || Object.keys(creditCardErrors).length) {
            // respond with form data and errors
            res.json({
                form: paymentForm,
                fieldErrors: [billingFormErrors, creditCardErrors],
                serverErrors: [],
                error: true
            });
        } else {
            viewData.address = {
                firstName: { value: paymentForm.addressFields.firstName.value },
                lastName: { value: paymentForm.addressFields.lastName.value },
                address1: { value: paymentForm.addressFields.address1.value },
                address2: { value: paymentForm.addressFields.address2.value },
                city: { value: paymentForm.addressFields.city.value },
                postalCode: { value: paymentForm.addressFields.postalCode.value },
                countryCode: { value: paymentForm.addressFields.country.value }
            };

            if (Object.prototype.hasOwnProperty.call(paymentForm.addressFields, 'states')) {
                viewData.address.stateCode = {
                    value: paymentForm.addressFields.states.stateCode.value
                };
            }

            viewData.paymentMethod = {
                value: paymentForm.paymentMethod.value,
                htmlName: paymentForm.paymentMethod.value
            };


            if (paymentForm.paymentMethod.value === 'PAY_U' || paymentForm.paymentMethod.value === 'CREDIT_CARD') {

                // [Updating ViewData for Card Payment]
                viewData.paymentInformation = {
                    selectedPaymentMethodID: {
                        value: paymentForm.paymentMethod.value,
                        htmlName: paymentForm.paymentMethod.value
                    },
                    cardType: {
                        value: paymentForm.creditCardFields.cardType.value,
                        htmlName: paymentForm.creditCardFields.cardType.htmlName
                    },
                    cardOwner: {
                        value: (paymentForm.creditCardFields.cardOwner.value),
                        htmlName: paymentForm.creditCardFields.cardOwner.htmlName
                    },
                    cardNumber: {
                        value: paymentForm.creditCardFields.cardNumber.value,
                        htmlName: paymentForm.creditCardFields.cardNumber.htmlName
                    },
                    securityCode: {
                        value: paymentForm.creditCardFields.securityCode.value,
                        htmlName: paymentForm.creditCardFields.securityCode.htmlName
                    },
                    expirationMonth: {
                        value: parseInt(
                            paymentForm.creditCardFields.expirationMonth.selectedOption,
                            10
                        ),
                        htmlName: paymentForm.creditCardFields.expirationMonth.htmlName
                    },
                    expirationYear: {
                        value: parseInt(paymentForm.creditCardFields.expirationYear.value, 10),
                        htmlName: paymentForm.creditCardFields.expirationYear.htmlName
                    },
                    documentType: {
                        value: paymentForm.creditCardFields.documentType.value,
                        htmlName: paymentForm.creditCardFields.documentType.htmlName
                    },
                    documentNumber: {
                        value: paymentForm.creditCardFields.documentNumber.value,
                        htmlName: paymentForm.creditCardFields.documentNumber.htmlName
                    },
                    installments: {
                        value: paymentForm.creditCardFields.installments.value,
                        htmlName: paymentForm.creditCardFields.installments.htmlName
                    },
                    deviceSessionId: {
                        value: paymentForm.creditCardFields.deviceSessionId.value,
                        htmlName: paymentForm.creditCardFields.deviceSessionId.htmlName
                    }
                };

                if (req.form.storedPaymentUUID) {
                    viewData.storedPaymentUUID = req.form.storedPaymentUUID;
                }
    
                if (req.form.securityCode && req.form.securityCode !== 'undefined') {
                    paymentForm.creditCardFields.securityCode.value = req.form.securityCode;
                }
                viewData.saveCard = paymentForm.creditCardFields.saveCard.checked;

            } else if (payuHelpers.isCashPaymentMethod(paymentForm.paymentMethod.value)) {

                // [Updating ViewData for Cash Payment]
                viewData.paymentInformation = {
                    selectedPaymentMethodID: {
                        value: paymentForm.paymentMethod.value,
                        htmlName: paymentForm.paymentMethod.value
                    },
                    documentType: {
                        value: paymentForm.payUCashFields.documentType.value,
                        htmlName: paymentForm.payUCashFields.documentType.htmlName
                    },
                    documentNumber: {
                        value: paymentForm.payUCashFields.documentNumber.value,
                        htmlName: paymentForm.payUCashFields.documentNumber.htmlName
                    }
                }
            } else if (paymentForm.paymentMethod.value === 'YAPE') {
                viewData.paymentInformation = {
                    selectedPaymentMethodID: {
                        value: paymentForm.paymentMethod.value,
                        htmlName: paymentForm.paymentMethod.value
                    },
                    documentType: {
                        value: paymentForm.yapeFields.documentType.value,
                        htmlName: paymentForm.yapeFields.documentType.htmlName
                    },
                    documentNumber: {
                        value: paymentForm.yapeFields.documentNumber.value,
                        htmlName: paymentForm.yapeFields.documentNumber.htmlName
                    },
                    yapePhoneNumber: {
                        value: paymentForm.yapeFields.yapePhoneNumber.value,
                        htmlName: paymentForm.yapeFields.yapePhoneNumber.htmlName
                    },
                    yapeCode: {
                        value: paymentForm.yapeFields.yapeCode.value,
                        htmlName: paymentForm.yapeFields.yapeCode.htmlName
                    }
                }
            }

            res.setViewData(viewData);
            
            var HookMgr = require('dw/system/HookMgr');
            var PaymentMgr = require('dw/order/PaymentMgr');
            var AccountModel = require('*/cartridge/models/account');
            var OrderModel = require('*/cartridge/models/order');
            var URLUtils = require('dw/web/URLUtils');
            var array = require('*/cartridge/scripts/util/array');
            var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
            var currentBasket = BasketMgr.getCurrentBasket();
            var billingData = res.getViewData();

            if (!currentBasket) {
                delete billingData.paymentInformation;
                res.json({
                    error: true,
                    cartError: true,
                    fieldErrors: [],
                    serverErrors: [],
                    redirectUrl: URLUtils.url('Cart-Show').toString()
                });
                this.emit('route:Complete', req, res);
                return;
            }


            var billingAddress = currentBasket.billingAddress;
            var billingForm = server.forms.getForm('billing');
            var paymentMethodID = billingData.paymentMethod.value;
            var result;

            if (isCardPayment) {
                billingForm.creditCardFields.cardNumber.htmlValue = '';
                billingForm.creditCardFields.securityCode.htmlValue = '';
            }


            Transaction.wrap(function () {
                if (!billingAddress) {
                    billingAddress = currentBasket.createBillingAddress();
                }

                billingAddress.setFirstName(billingData.address.firstName.value);
                billingAddress.setLastName(billingData.address.lastName.value);
                billingAddress.setPostalCode(billingData.address.postalCode.value);
                billingAddress.setCity(billingData.address.city.value);
                billingAddress.setAddress1(billingData.address.address1.value);
                billingAddress.setAddress2(billingData.address.address2.value);
                billingAddress.setStateCode(billingData.address.stateCode.value);
                billingAddress.setCountryCode(billingData.address.countryCode.value);
                // billingAddress.setPhone(billingData.phone.value);
            });
                // if there is no selected payment option and balance is greater than zero
            if (!paymentMethodID && currentBasket.totalGrossPrice.value > 0) {
                var noPaymentMethod = {};

                noPaymentMethod[billingData.paymentMethod.htmlName] = Resource.msg('error.no.selected.payment.method', 'creditCard', null);

                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: [noPaymentMethod],
                    serverErrors: [],
                    error: true
                });
                this.emit('route:Complete', req, res);
                return;
            }
            if (!PaymentMgr.getPaymentMethod(paymentMethodID).paymentProcessor) {
                throw new Error(Resource.msg(
                    'error.payment.processor.missing',
                    'checkout',
                    null
                ));
            }

            var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();


            var paymentFormResult;

            var hookName = 'app.payment.form.processor.' + processor.ID.toLowerCase();

            
            if (HookManager.hasHook('app.payment.form.processor.' + processor.ID.toLowerCase())) {
                paymentFormResult = HookManager.callHook(
                    'app.payment.form.processor.' + processor.ID.toLowerCase(),
                    'processForm',
                    req,
                    paymentForm,
                    viewData
                );
            } else {
                paymentFormResult = HookManager.callHook('app.payment.form.processor.default_form_processor', 'processForm');
            }

            if (paymentFormResult.error && paymentFormResult.fieldErrors) {
                formFieldErrors.push(paymentFormResult.fieldErrors);
            }

            if (formFieldErrors.length || paymentFormResult.serverErrors) {
                // respond with form data and errors
                res.json({
                    form: paymentForm,
                    fieldErrors: formFieldErrors,
                    serverErrors: paymentFormResult.serverErrors ? paymentFormResult.serverErrors : [],
                    error: true
                });
                // return next();
                this.emit('route:Complete', req, res);
                return;
            }


            if ((paymentMethodID === 'CREDIT_CARD' || paymentMethodID === 'PAYU') && billingData.storedPaymentUUID
                && req.currentCustomer.raw.authenticated
                && req.currentCustomer.raw.registered) {
                var paymentInstruments = req.currentCustomer.wallet.paymentInstruments;
                var paymentInstrument = array.find(paymentInstruments, function (item) {
                    return billingData.storedPaymentUUID === item.UUID;
                });

                billingData.paymentInformation.cardOwner.value = paymentInstrument.creditCardHolder;
                billingData.paymentInformation.cardNumber.value = paymentInstrument.creditCardNumber;
                billingData.paymentInformation.cardType.value = paymentInstrument.creditCardType;
                billingData.paymentInformation.securityCode.value = (req.form.securityCode && req.form.securityCode !== 'undefined') ? req.form.securityCode : '';
                billingData.paymentInformation.expirationMonth.value = paymentInstrument.creditCardExpirationMonth;
                billingData.paymentInformation.expirationYear.value = paymentInstrument.creditCardExpirationYear;
                billingData.paymentInformation.creditCardToken = paymentInstrument.raw.creditCardToken;
            } else if (paymentMethodID === 'PAY_U_CASH') {
                
            } else if (paymentMethodID === 'YAPE') {
                
            }

            var hasHook = HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase());
            var hookName = 'app.payment.processor.' + processor.ID.toLowerCase();
            if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
                result = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
                    'Handle',
                    currentBasket,
                    billingData.paymentInformation,
                    paymentMethodID,
                    req
                );
            } else {
                result = HookMgr.callHook('app.payment.processor.default', 'Handle');
            }

            if (result.error) {
                delete billingData.paymentInformation;

                res.json({
                    form: billingForm,
                    fieldErrors: result.fieldErrors,
                    serverErrors: result.serverErrors,
                    error: true
                });
                this.emit('route:Complete', req, res);
                return;
            }

            if (HookMgr.hasHook('app.payment.form.processor.' + processor.ID.toLowerCase())) {
                HookMgr.callHook('app.payment.form.processor.' + processor.ID.toLowerCase(),
                    'savePaymentInformation',
                    req,
                    currentBasket,
                    billingData
                );
            } else {
                HookMgr.callHook('app.payment.form.processor.default', 'savePaymentInformation');
            }

            // Calculate the basket
            Transaction.wrap(function () {
                basketCalculationHelpers.calculateTotals(currentBasket);
            });

            // Re-calculate the payments.
            var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
                currentBasket
            );

            if (calculatedPaymentTransaction.error) {
                res.json({
                    form: paymentForm,
                    fieldErrors: [],
                    serverErrors: [Resource.msg('error.technical', 'checkout', null)],
                    error: true
                });
                this.emit('route:Complete', req, res);
                return;
            }

            var usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');
            if (usingMultiShipping === true && currentBasket.shipments.length < 2) {
                req.session.privacyCache.set('usingMultiShipping', false);
                usingMultiShipping = false;
            }

            var basketModel = new OrderModel(
                currentBasket,
                { usingMultiShipping: usingMultiShipping, countryCode: billingData.address.countryCode.value, containerView: 'basket' }
            );
            
            var accountModel = new AccountModel(req.currentCustomer);
            var renderedStoredPaymentInstrument = COHelpers.getRenderedPaymentInstruments(
                    req,
                    accountModel
            );

            // Template for PayU Cash Payment Summary
            var payUCashSummaryHTML = '';
            var isCashPaymentMethod = payuHelpers.isCashPaymentMethod(paymentMethodID);
            if (isCashPaymentMethod) {
                var context = { order: basketModel };
                payUCashSummaryHTML = renderTemplateHelper.getRenderedHtml(context, 'checkout/billing/paymentOptions/paymentOptionsSummary.isml');
                basketModel.payUCashSummaryHTML = payUCashSummaryHTML;
            } else if (paymentMethodID === 'YAPE') {
                var context = { order: basketModel };

                var yapeSummary = renderTemplateHelper.getRenderedHtml(context, 'checkout/billing/paymentOptions/paymentOptionsSummary.isml');
                basketModel.yapeSummary = yapeSummary;
            }

            delete billingData.paymentInformation;

            res.json({
                renderedPaymentInstruments: renderedStoredPaymentInstrument,
                // renderedPaymentInstrumentsRedirect: renderedStoredRedirectPaymentInstrument,
                customer: accountModel,
                order: basketModel,
                form: billingForm,
                error: false
            });
        }

        this.emit('route:Complete', req, res);
    }
)

module.exports = server.exports();