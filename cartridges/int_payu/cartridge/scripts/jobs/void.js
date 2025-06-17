'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Logger = require('dw/system/Logger');
var payuHelpers = require('*/cartridge/scripts/helpers/payUHelpers');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var PayUFactory = require('*/cartridge/scripts/utils/PayuFactory');
var Order = require('dw/order/Order');
var PaymentMgr = require('dw/order/PaymentMgr');
var COHelpers = require('*/cartridge/scripts/checkout/checkoutHelpers');

function updateVoidOrderNote(response, order) {
    var orderNote = COHelpers.getPaymentTransactionOrderNotes(response, 'void');
    order.addNote(orderNote.title, orderNote.message);
}
module.exports.execute = (parameters) => {

    if (!PayUFactory.CONFIGS.IS_VOID_ALLOWED) {
        return new Status(Status.ERROR, 'OPERATION_NOT_ALLOWED', 'Void transactions are not permitted on this site.');
    }

    var log = Logger.getLogger('PAYU', 'PayUCaptureJob');
    log.info('Starting PayU Void Job');
    var orderId = parameters.orderId;
    if (!orderId) {
        log.error('No Order ID provided.');
        return new Status(Status.ERROR, 'NO_ORDER_ID', 'Please provide an Order ID.');
    }

    var order = OrderMgr.getOrder(orderId);
    if (!order) {
        log.error('Order not found - {0}', orderId);
        return new Status(Status.ERROR, 'ORDER_NOT_FOUND', 'Order not found.');
    }

    try {
        var paymentId = order.custom.payUPaymentId;

        if (!paymentId || paymentId === '') {
            log.error('No payment ID found for order {0}.', orderId);
            return new Status(Status.ERROR, 'PAYMENT_ID_NOT_FOUND', 'PAYMENT_ID_NOT_FOUND');
        }

        var paymentResponse = payuHelpers.retrievePayment(paymentId);

        if (!paymentResponse || paymentResponse.error) {
            log.error('Failed to retrieve payment for order {0}: {1}', orderId, JSON.stringify(paymentResponse));
            return new Status(Status.ERROR, 'INVALID_PAYMENT', 'Invalid Payment');
        }

        if (paymentResponse.status !== 'Authorized') {
            log.error('Payment for order {0} is not in Authorized status.', orderId);
            return new Status(Status.ERROR, 'INVALID_PAYMENT_STATUS', 'Payment is not in Captured status.');
        }

        var voidResponse = payuHelpers.void(paymentId);

        if (!voidResponse || voidResponse.error) {
            log.error('Unable to void the transaction for order {0}: \nError: {1}', orderId, JSON.stringify(voidResponse));
            return new Status(Status.ERROR, 'VOID_FAILED', 'Void failed.');
        }

        if (voidResponse.result && voidResponse.result.status === 'Succeed') {
            Transaction.wrap(function () {
                order.custom.pay_u_payment_status = 'Voided';
                order.custom.payURawResponse = JSON.stringify(voidResponse);
                updateVoidOrderNote(voidResponse, order);
            });
            log.info('Void successfully for order {0}', orderId);
            return new Status(Status.OK, 'SUCCESS', 'Void successfully.');
        }
        log.error('Unexpected void response for order {0}: {1}', orderId, JSON.stringify(voidResponse));
        return new Status(Status.ERROR, 'VOID', 'Unexpected void response.');

    } catch (e) {
        var err = e;
        log.error('Exception occurred while void for order {0}: {1}', orderId, e.message);
        return new Status(Status.ERROR, 'EXCEPTION', 'Exception occurred: ' + e.message);  
    }

}