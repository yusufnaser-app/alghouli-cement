'use strict';
/**
 * سجل مزودي الخدمة — يعرّف الحقول المطلوبة لكل مزود.
 * كل حقل: { key, label, type, required, secret }
 */

const PROVIDERS = {
  sms: {
    label_ar: 'الرسائل النصية',
    description_ar: 'إرسال رسائل OTP والإشعارات',
    fields: [
      { key: 'provider', label: 'المزود', type: 'select',
        options: ['twilio', 'unifonic', 'taqnyat', 'custom'],
        required: true, secret: false },
      { key: 'twilio_account_sid', label: 'Twilio Account SID', type: 'text', secret: true },
      { key: 'twilio_auth_token', label: 'Twilio Auth Token', type: 'password', secret: true },
      { key: 'twilio_from', label: 'Twilio From Number', type: 'text', secret: false },
      { key: 'unifonic_app_sid', label: 'Unifonic App SID', type: 'text', secret: true },
      { key: 'unifonic_sender', label: 'Unifonic Sender ID', type: 'text', secret: false },
      { key: 'taqnyat_bearer', label: 'Taqnyat Bearer Token', type: 'password', secret: true },
      { key: 'taqnyat_sender', label: 'Taqnyat Sender', type: 'text', secret: false },
      { key: 'custom_url', label: 'Custom API URL', type: 'text', secret: false },
      { key: 'custom_token', label: 'Custom Token', type: 'password', secret: true },
    ],
  },

  push: {
    label_ar: 'الإشعارات الفورية (Firebase)',
    description_ar: 'Push Notifications عبر Firebase Cloud Messaging',
    fields: [
      { key: 'service_account_json', label: 'Service Account JSON', type: 'textarea', secret: true },
      { key: 'project_id', label: 'Firebase Project ID', type: 'text', secret: false },
    ],
  },

  whatsapp: {
    label_ar: 'واتساب',
    description_ar: 'إرسال رسائل واتساب للعملاء',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', secret: false },
      { key: 'access_token', label: 'Access Token', type: 'password', secret: true },
      { key: 'business_account_id', label: 'Business Account ID', type: 'text', secret: false },
    ],
  },

  yemensoft: {
    label_ar: 'يمن سوفت (YemenSoft)',
    description_ar: 'تكامل مع نظام المحاسبة الخارجي',
    fields: [
      { key: 'base_url', label: 'Base URL', type: 'text', secret: false },
      { key: 'api_key', label: 'API Key', type: 'password', secret: true },
      { key: 'company_code', label: 'Company Code', type: 'text', secret: false },
    ],
  },

  storage: {
    label_ar: 'التخزين',
    description_ar: 'تخزين ملفات الفواتير والشعارات',
    fields: [
      { key: 'provider', label: 'المزود', type: 'select',
        options: ['supabase', 's3', 'local'], required: true, secret: false },
      { key: 's3_endpoint', label: 'S3 Endpoint', type: 'text', secret: false },
      { key: 's3_bucket', label: 'S3 Bucket', type: 'text', secret: false },
      { key: 's3_access_key', label: 'S3 Access Key', type: 'text', secret: true },
      { key: 's3_secret_key', label: 'S3 Secret Key', type: 'password', secret: true },
    ],
  },

  email: {
    label_ar: 'البريد الإلكتروني',
    description_ar: 'إرسال الفواتير والإشعارات بالبريد',
    fields: [
      { key: 'provider', label: 'المزود', type: 'select',
        options: ['smtp', 'sendgrid', 'mailgun'], required: true, secret: false },
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', secret: false },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', secret: false },
      { key: 'smtp_user', label: 'SMTP User', type: 'text', secret: false },
      { key: 'smtp_password', label: 'SMTP Password', type: 'password', secret: true },
      { key: 'from_email', label: 'From Email', type: 'text', secret: false },
    ],
  },
};

const getRegistry = () => PROVIDERS;
const getProvider = (name) => PROVIDERS[name] || null;

module.exports = { PROVIDERS, getRegistry, getProvider };
