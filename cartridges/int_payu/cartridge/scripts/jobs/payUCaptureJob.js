'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

function capturePayment(parameters) {
    var log = Logger.getLogger('PAYU', 'PayUCaptureJob');
    log.info('Starting PayU Capture Job');

    var orders = OrderMgr.queryOrders(
        "custom.payUPaymentId != NULL AND custom.pay_u_payment_status = {0}",
        null,
        PayUFactory.PAYMENT_STATUS.AUTHORIZED,
    );

    var capturedCount = 0;
    var failedCount = 0;

    while (orders.hasNext()) {
        var order = orders.next();
        try {

            log.info('Processing order {0} for capture', order.orderNo);
            var paymentId = order.custom.payUPaymentId;
            

            // Retrieve Payment Status

            var paymentInfo = payuHelpers.retrievePayment(paymentId);
            var isValidPayment = false;
            if (!paymentInfo || (paymentInfo && paymentInfo.error)) {
                Logger.error('Retrieve Payment Failed: {0}', JSON.stringify(paymentInfo));
            } else if (paymentInfo.status === 'Authorized') {
                isValidPayment = true;
            }

            var captureResult = payuHelpers.capturePayment(paymentId);

            if ( !captureResult || (captureResult && captureResult.error) ) {
                failedCount++;
                log.error('Capture failed for Order {0}: {1}', order.orderNo, JSON.stringify(captureResult));
            } else if (isValidPayment) {
                COHelpers.savePaymentInformationInOrder(captureResult, order, 'Captured');
                capturedCount++;
            }
        } catch (e) {
            log.error('Error capturing payment for Order {0}: {1}', order.orderNo, e.toString());
            failedCount++;
        }
    }

    log.info('PayU Capture Job Completed. Captured: {0}, Failed: {1}', capturedCount, failedCount);
    return new Status(Status.OK);;
}

module.exports.capturePayment = capturePayment;
