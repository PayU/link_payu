# PayU Integration for Salesforce Commerce Cloud (SFCC)

This repository contains Salesforce Commerce Cloud (SFCC) cartridges for integrating the PayU payment gateway. These cartridges enable seamless handling of online payments through PayU, supporting multiple payment methods and regional requirements across Latin America (LATAM).

## Project Overview

The PayU integration provides a comprehensive payment solution for SFCC stores, supporting:
- Multiple payment methods (Credit Cards, Cash payments, Bank transfers, Yape, etc.)
- Multi-country support across LATAM (Argentina, Brazil, Chile, Colombia, Mexico, Panama, Peru)
- Payment processing including authorization, capture, void, and refund operations
- Webhook handling for real-time payment status updates
- Custom job schedulers for payment management

### Key Features

- **Payment Methods**: Credit card processing, cash payments, bank transfers, and local payment methods
- **Multi-regional Support**: Configurable for different LATAM countries with localized payment options
- **Payment Operations**: Authorization, immediate/delayed capture, void, partial/full refunds
- **Webhook Integration**: Real-time payment status notifications
- **Job Scheduling**: Automated payment processing jobs for capture, void, and refund operations
- **Responsive UI**: Modern checkout interface with PayU payment forms

## Project Structure

```
├── cartridges/int_payu/           # Main PayU integration cartridge
│   ├── cartridge/
│   │   ├── controllers/           # SFCC controllers for checkout and payment
│   │   ├── models/               # Business logic models
│   │   ├── scripts/              # Backend scripts and helpers
│   │   │   ├── jobs/            # Payment job scripts (capture, void, refund)
│   │   │   ├── helpers/         # PayU integration helpers
│   │   │   └── hooks/           # Payment hooks and webhooks
│   │   ├── forms/               # Payment form definitions
│   │   ├── templates/           # Frontend templates
│   │   ├── client/              # Frontend assets (JS/SCSS)
│   │   └── static/              # Compiled static assets
│   ├── package.json             # Cartridge hooks configuration
│   └── steptypes.json          # Custom job step definitions
├── metadata/                    # SFCC metadata configuration
│   ├── jobs.xml                # Job definitions for payment operations
│   ├── services.xml            # Service definitions
│   └── sites/                  # Site-specific configurations per country
├── package.json                # Main build configuration
├── webpack.config.js           # Frontend build configuration
└── README.md                   # This file
```

## Build Process

The project uses a modern build system with Webpack and SGMF (StoreFront Reference Architecture) scripts.

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn
- Salesforce Commerce Cloud Business Manager access
- PayU merchant account and API credentials

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd link_payu
```

2. Install dependencies:
```bash
npm install
```

### Build Commands

- **Lint code**: `npm run lint`
- **Fix linting issues**: `npm run lint:fix`
- **Compile JavaScript**: `npm run compile:js`
- **Compile SCSS**: `npm run compile:scss`
- **Upload cartridge**: `npm run uploadCartridge`
- **Upload files**: `npm run upload`

### Development Workflow

1. Make your code changes in the appropriate cartridge files
2. Run linting: `npm run lint:fix`
3. Compile assets: `npm run compile:js && npm run compile:scss`
4. Upload to sandbox: `npm run uploadCartridge`

## Deployment

### Setting up dw.json

Create a `dw.json` file in the project root (this file is gitignored for security):

```json
{
    "hostname": "your-sandbox-hostname.demandware.net",
    "username": "your-username",
    "password": "your-password",
    "code-version": "version-name"
}
```

### Deployment Steps

1. **Prepare the cartridge**:
```bash
npm run compile:js
npm run compile:scss
npm run lint
```

2. **Upload to sandbox**:
```bash
npm run uploadCartridge
```

3. **Configure Business Manager**:
   - Add `int_payu` to your cartridge path
   - Import metadata (jobs.xml, services.xml, site configurations)
   - Configure PayU credentials in Site Preferences
   - Set up payment methods and processors per site

4. **Configure PayU Settings**:
   - API Key, API Login, Merchant ID
   - Account IDs for each country
   - Payment method configurations
   - Webhook endpoints

### Production Deployment

1. Create a code version in Business Manager
2. Upload the cartridge to the production instance
3. Import metadata configurations
4. Update cartridge path in production
5. Configure production PayU credentials
6. Test payment flows thoroughly

## Salesforce Review Submission

### Pre-submission Checklist

1. **Code Quality**:
   - All lint checks pass: `npm run lint`
   - No console.log statements in production code
   - Proper error handling and logging
   - Security best practices followed

2. **Documentation**:
   - Code is well-commented
   - API documentation is complete
   - Installation guide is provided
   - Configuration instructions are clear

3. **Testing**:
   - All payment methods tested
   - Error scenarios handled properly
   - Cross-browser compatibility verified
   - Mobile responsiveness confirmed

4. **Compliance**:
   - PCI DSS compliance maintained
   - No sensitive data logged
   - Proper data encryption
   - GDPR compliance if applicable

### Submission Process

1. **Package the cartridge**:
   - Create a clean build: `npm run compile:js && npm run compile:scss`
   - Remove development files and node_modules
   - Create a ZIP file of the cartridges directory

2. **Prepare documentation**:
   - Installation guide
   - Configuration manual
   - API documentation
   - Testing scenarios

3. **Submit to Salesforce**:
   - Login to Salesforce Partner Portal
   - Navigate to App Exchange submission
   - Upload cartridge package and documentation
   - Fill out compliance questionnaire
   - Submit for review

4. **Review Process**:
   - Salesforce security review (2-4 weeks)
   - Functional testing by Salesforce team
   - Address any feedback or issues
   - Final approval and publication

## Debugging

### Local Development

1. **Enable debug mode**:
   - Set `PAYU_DEBUG=true` in site preferences
   - Enable detailed logging in Business Manager

2. **Log locations**:
   - Custom logs: `Logs > Custom Logs > payu-debug`
   - Error logs: `Logs > Error Logs`
   - Service logs: `Logs > Service Logs`

3. **Common debug points**:
```javascript
// Add to PayU helper functions
var Logger = require('dw/system/Logger');
var logger = Logger.getLogger('payu-debug', 'payu');

logger.info('Payment request: {0}', JSON.stringify(paymentRequest));
```

### Testing Payment Flows

1. **Use PayU test credentials**:
   - Test API keys and merchant accounts
   - Use test credit card numbers
   - Verify different payment scenarios

2. **Test scenarios**:
   - Successful payments
   - Failed payments
   - Network timeouts
   - Webhook processing
   - Refund operations

3. **Webhook testing**:
   - Use ngrok for local webhook testing
   - Monitor webhook logs in Business Manager
   - Verify webhook signature validation

### Common Issues and Solutions

1. **Payment failures**:
   - Check PayU credentials configuration
   - Verify API endpoint URLs
   - Review payment request format
   - Check country-specific requirements

2. **Webhook issues**:
   - Verify webhook URL accessibility
   - Check signature validation
   - Review webhook payload format
   - Ensure proper HTTP response codes

3. **Build issues**:
   - Clear node_modules: `rm -rf node_modules && npm install`
   - Check Node.js version compatibility
   - Verify webpack configuration
   - Review SGMF scripts version

### Performance Monitoring

- Monitor payment processing times
- Track API response times
- Review error rates and patterns
- Analyze payment success rates

## Support and Documentation

- **PayU Documentation**: https://developers.payulatam.com/latam/en/docs/tools/shopping-cart-plugins/salesforce.html
- **SFCC Documentation**: https://documentation.b2c.commercecloud.salesforce.com/
- **Technical Support**: Contact PayU technical support for payment gateway issues
- **SFCC Support**: Use Salesforce Support portal for platform-related issues

## Contributing

1. Follow the existing code style and patterns
2. Add unit tests for new functionality
3. Update documentation for any changes
4. Ensure all builds pass before submitting PRs
5. Follow semantic versioning for releases