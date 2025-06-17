$(document).ready(function () {
    $('.nav-tabs .nav-item a').on('click', function (e) {
        e.preventDefault();

        // Remove active class from all tabs (parent <li>)
        $('.nav-tabs .nav-item').removeClass('active-tab');

        // Add active class to the clicked tab's parent <li>
        $(this).closest('.nav-item').addClass('active-tab');

        // Get the selected payment method ID
        var selectedMethod = $(this).closest('.nav-item').data('method-id');

        // Update the hidden input field with the selected payment method
        $('input[name="dwfrm_billing_paymentMethod"]').val(selectedMethod);

        // Get the corresponding content ID from href
        var targetContent = $(this).attr('href');

        // Show the selected content

        // Show the corresponding content smoothly
        $('.tab-pane').removeClass('show active');
        if (selectedMethod === 'PAY_U') {
            $('.payu-cash-content').removeClass('active');
        } else if (selectedMethod === 'PAY_U_CASH') {
            $('#credit-card-content').removeClass('active')
        } else if (selectedMethod === 'YAPE') {
            $('.tab-pane').removeClass('active');
        }

        $(targetContent).addClass('show active');
    });
});
