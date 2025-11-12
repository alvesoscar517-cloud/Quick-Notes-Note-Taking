// index.js

const express = require('express');
const cors = require('cors');
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');

// ADD REQUIRED LIBRARIES FOR SHARE FEATURE
const fs = require('fs');
const path = require('path');
const DOMPurify = require('isomorphic-dompurify');
const { JSDOM } = require('jsdom'); // Library for HTML processing on server
// nodemailer will be loaded lazily when needed

// --- INITIALIZATION ---
const app = express();
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: "video-summarizer-473606.appspot.com"
  });
}
const db = admin.firestore();
const bucket = admin.storage().bucket();

// Lemon Squeezy Configuration
const LEMON_SQUEEZY_API_KEY = process.env.LEMON_SQUEEZY_API_KEY;
const LEMON_SQUEEZY_STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID;
const LEMON_SQUEEZY_PRODUCT_ID = process.env.LEMON_SQUEEZY_PRODUCT_ID; // Premium product ID
const LEMON_SQUEEZY_TRIAL_PRODUCT_ID = process.env.LEMON_SQUEEZY_TRIAL_PRODUCT_ID; // Trial product ID
const LEMON_SQUEEZY_VARIANT_ID = process.env.LEMON_SQUEEZY_VARIANT_ID; // Premium variant ID
const LEMON_SQUEEZY_TRIAL_VARIANT_ID = process.env.LEMON_SQUEEZY_TRIAL_VARIANT_ID; // Trial variant ID
const LEMON_SQUEEZY_WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

// --- MIDDLEWARE ---
// CORS configuration to allow Chrome Extension
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Allow Chrome Extension origins
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    // Allow Vercel preview URLs
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }

    // Default: allow all (you can restrict this later)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Email']
}));

// WEBHOOK ROUTE - MUST BE BEFORE express.json() middleware
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const payload = req.body;

    console.log('🔍 Webhook received');
    console.log('Payload type:', typeof payload);
    console.log('Payload length:', payload ? payload.length : 'undefined');

    if (!signature || !LEMON_SQUEEZY_WEBHOOK_SECRET) {
      console.error('Missing webhook signature or secret');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const isValidSignature = verifyLemonSqueezyWebhook(payload, signature);
    console.log('Signature valid:', isValidSignature);

    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse JSON after signature verification
    let eventData;
    try {
      const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
      eventData = JSON.parse(payloadString);
      console.log('Parsed event data:', eventData);
    } catch (parseError) {
      console.error('Error parsing JSON payload:', parseError);
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const eventType = eventData.meta.event_name;

    console.log(`Received Lemon Squeezy webhook: ${eventType}`);

    // Handle different event types
    switch (eventType) {
      case 'order_created':
        const orderData = eventData.data;
        if (orderData.attributes.status === 'paid') {
          await processSuccessfulPayment(orderData);
        }
        break;

      case 'subscription_created':
        const subscriptionData = eventData.data;
        if (subscriptionData.attributes.status === 'active') {
          // Check if this is a free trial or paid subscription
          const isTrial = subscriptionData.attributes.trial_ends_at &&
            new Date(subscriptionData.attributes.trial_ends_at) > new Date();

          if (isTrial) {
            await processFreeTrialStart(subscriptionData);
          } else {
            await processSuccessfulPayment(subscriptionData);
          }
        }
        break;

      case 'subscription_updated':
        const updatedSubscriptionData = eventData.data;
        console.log(`📋 Subscription updated - Status: ${updatedSubscriptionData.attributes.status}`);
        console.log(`📋 Subscription data:`, JSON.stringify(updatedSubscriptionData.attributes, null, 2));

        if (updatedSubscriptionData.attributes.status === 'active') {
          // This is a renewal - extend expiry date
          console.log('🔄 Processing subscription renewal...');
          await processSubscriptionRenewal(updatedSubscriptionData);
        } else if (updatedSubscriptionData.attributes.status === 'cancelled') {
          console.log('❌ Processing subscription cancellation...');
          await processSubscriptionCancellation(updatedSubscriptionData);
        } else if (updatedSubscriptionData.attributes.status === 'paused') {
          console.log('⏸️ Processing subscription pause...');
          await processSubscriptionPause(updatedSubscriptionData);
        } else if (updatedSubscriptionData.attributes.status === 'resumed') {
          console.log('▶️ Processing subscription resume...');
          await processSubscriptionResume(updatedSubscriptionData);
        } else if (updatedSubscriptionData.attributes.status === 'expired') {
          console.log('⏰ Processing subscription expiration...');
          await processSubscriptionExpiration(updatedSubscriptionData);
        } else {
          console.log(`⚠️ Unknown subscription status: ${updatedSubscriptionData.attributes.status}`);
        }
        break;

      case 'subscription_cancelled':
        const cancelledSubscriptionData1 = eventData.data;
        console.log('❌ Processing subscription_cancelled event...');
        await processSubscriptionCancellation(cancelledSubscriptionData1);
        break;

      case 'subscription_expired':
        const expiredSubscriptionData = eventData.data;
        console.log('⏰ Processing subscription_expired event...');
        await processSubscriptionExpiration(expiredSubscriptionData);
        break;

      case 'subscription_paused':
        const pausedSubscriptionData = eventData.data;
        console.log('⏸️ Processing subscription_paused event...');
        await processSubscriptionPause(pausedSubscriptionData);
        break;

      case 'subscription_resumed':
        const resumedSubscriptionData = eventData.data;
        console.log('▶️ Processing subscription_resumed event...');
        await processSubscriptionResume(resumedSubscriptionData);
        break;

      case 'subscription_payment_success':
        const paymentSuccessData = eventData.data;
        // This is when monthly payment succeeds - could be trial conversion or renewal
        await processSubscriptionRenewal(paymentSuccessData);
        break;

      case 'subscription_payment_failed':
        const paymentFailedData = eventData.data;
        console.log(`⚠️ Payment failed for subscription: ${paymentFailedData.id}`);
        // Could implement grace period logic here
        break;

      case 'subscription_payment_recovered':
        const paymentRecoveredData = eventData.data;
        // Payment was recovered after failure
        await processSubscriptionRenewal(paymentRecoveredData);
        break;

      case 'order_refunded':
        const refundedOrderData = eventData.data;
        await processOrderRefund(refundedOrderData);
        break;

      case 'subscription_payment_refunded':
        const refundedSubscriptionData = eventData.data;
        await processSubscriptionRefund(refundedSubscriptionData);
        break;

      case 'subscription_cancelled':
        const cancelledSubscriptionData = eventData.data;
        // Check if cancellation is due to refund
        if (cancelledSubscriptionData.attributes.cancellation_reason === 'refund_requested') {
          await processSubscriptionCancellationRefund(cancelledSubscriptionData);
        } else {
          await processSubscriptionCancellation(cancelledSubscriptionData);
        }
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Add express.json() middleware AFTER webhook route
app.use(express.json({ limit: '10mb' }));

// Utility functions

const getCurrentDateString = () => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};



const getNextResetTime = () => {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
};

// Check if premium subscription has expired
const isPremiumExpired = (premiumExpiry) => {
  if (!premiumExpiry) return true;

  const now = new Date();
  const expiryDate = premiumExpiry.toDate ? premiumExpiry.toDate() : new Date(premiumExpiry);

  return now > expiryDate;
};

// Lemon Squeezy Functions
const createLemonSqueezyCheckout = async (userEmail, productId, price, isTrial = true, retryCount = 0) => {
  const maxRetries = 3;

  try {
    console.log(`🔄 Creating Lemon Squeezy checkout... (attempt ${retryCount + 1}/${maxRetries + 1})`);
    console.log('📋 Parameters:', {
      userEmail,
      productId,
      price,
      isTrial,
      storeId: LEMON_SQUEEZY_STORE_ID,
      variantId: LEMON_SQUEEZY_VARIANT_ID,
      trialVariantId: LEMON_SQUEEZY_TRIAL_VARIANT_ID,
      apiKeyLength: LEMON_SQUEEZY_API_KEY ? LEMON_SQUEEZY_API_KEY.length : 0
    });

    // Use different product ID and variant ID for trial vs paid checkout
    const targetProductId = isTrial ? LEMON_SQUEEZY_TRIAL_PRODUCT_ID : LEMON_SQUEEZY_PRODUCT_ID;
    const targetVariantId = isTrial ? LEMON_SQUEEZY_TRIAL_VARIANT_ID : LEMON_SQUEEZY_VARIANT_ID;

    console.log(`📋 Using Product ID: ${targetProductId}, Variant ID: ${targetVariantId} (isTrial: ${isTrial})`);

    const requestData = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: userEmail,
            custom: {
              user_email: userEmail,
              product_id: targetProductId,
              is_trial: isTrial.toString()
            }
          }
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: LEMON_SQUEEZY_STORE_ID
            }
          },
          variant: {
            data: {
              type: 'variants',
              id: targetVariantId
            }
          }
        }
      }
    };

    console.log('📤 Request data:', JSON.stringify(requestData, null, 2));

    const response = await axios.post('https://api.lemonsqueezy.com/v1/checkouts', requestData, {
      headers: {
        'Authorization': `Bearer ${LEMON_SQUEEZY_API_KEY}`,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json'
      },
      timeout: 30000, // 30 seconds timeout
      maxRedirects: 5
    });

    console.log('📥 Response status:', response.status);
    console.log('📥 Response data:', JSON.stringify(response.data, null, 2));

    if (!response.data || !response.data.data || !response.data.data.attributes || !response.data.data.attributes.url) {
      throw new Error('Invalid response structure from Lemon Squeezy');
    }

    const checkoutUrl = response.data.data.attributes.url;
    console.log('✅ Checkout URL created:', checkoutUrl);

    return checkoutUrl;
  } catch (error) {
    console.error(`❌ Error creating Lemon Squeezy checkout (attempt ${retryCount + 1}):`);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error response status:', error.response?.status);
    console.error('Error response data:', error.response?.data);
    console.error('Error response headers:', error.response?.headers);

    // Retry logic for network errors
    if (retryCount < maxRetries && (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.response?.status >= 500
    )) {
      console.log(`🔄 Retrying in ${(retryCount + 1) * 2} seconds...`);
      await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
      return createLemonSqueezyCheckout(userEmail, productId, price, isTrial, retryCount + 1);
    }

    // More specific error messages
    if (error.response?.status === 401) {
      throw new Error('Invalid Lemon Squeezy API key');
    } else if (error.response?.status === 404) {
      throw new Error('Store or variant not found in Lemon Squeezy');
    } else if (error.response?.status === 422) {
      throw new Error('Invalid checkout data: ' + JSON.stringify(error.response.data));
    } else if (error.response?.status >= 500) {
      throw new Error('Lemon Squeezy server error: ' + error.response.status);
    } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      throw new Error('Network error connecting to Lemon Squeezy');
    } else {
      throw new Error('Failed to create checkout session: ' + (error.response?.data?.message || error.message));
    }
  }
};

const verifyLemonSqueezyWebhook = (payload, signature) => {
  try {
    console.log('🔍 Verifying webhook signature');
    console.log('Payload type:', typeof payload);
    console.log('Payload length:', payload ? payload.length : 'undefined');

    // Ensure payload is a Buffer or string
    let rawPayload;
    if (Buffer.isBuffer(payload)) {
      rawPayload = payload;
    } else if (typeof payload === 'string') {
      rawPayload = Buffer.from(payload, 'utf8');
    } else {
      console.error('Invalid payload type:', typeof payload);
      return false;
    }

    console.log('Raw payload length:', rawPayload.length);

    const hmac = crypto.createHmac('sha256', LEMON_SQUEEZY_WEBHOOK_SECRET);
    hmac.update(rawPayload);
    const digest = hmac.digest('hex');

    console.log('Generated digest:', digest);
    console.log('Expected signature:', signature);

    const isValid = crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest, 'hex'));
    console.log('Signature verification result:', isValid);

    return isValid;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
};

// Helper function to convert markdown to HTML (fallback for AI responses)
const convertMarkdownToHTML = (text) => {
  if (!text || typeof text !== 'string') return text;

  // If content already contains HTML tags, return as-is
  // Check for common HTML tags that indicate formatted content
  if (/<(span|div|p|h[1-6]|strong|em|ul|ol|li|blockquote|code|pre|a)\b[^>]*>/i.test(text)) {
    return text;
  }

  // Convert markdown to HTML
  let html = text;

  // Headers (must come before other conversions)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic (must be done in correct order)
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // Unordered lists
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '<hr>');

  // Line breaks - convert double newlines to <br><br>, single newlines to <br>
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');

  return html;
};

// Helper function to extract user email from webhook data
const extractUserEmailFromWebhook = (webhookData) => {
  // Priority 1: Custom data (set when creating checkout)
  const customEmail = webhookData.attributes?.custom?.user_email;
  if (customEmail) return customEmail;

  // Priority 2: User email field
  const userEmail = webhookData.attributes?.user_email;
  if (userEmail) return userEmail;

  // Priority 3: Email field
  const email = webhookData.attributes?.email;
  if (email) return email;

  // Priority 4: Checkout data
  const checkoutEmail = webhookData.attributes?.checkout_data?.email;
  if (checkoutEmail) return checkoutEmail;

  console.error('❌ No email found in webhook data:', {
    id: webhookData.id,
    type: webhookData.type,
    attributes: Object.keys(webhookData.attributes || {})
  });

  return null;
};

const processSuccessfulPayment = async (orderData) => {
  try {
    const userEmail = extractUserEmailFromWebhook(orderData);
    const orderId = orderData.id;
    const isSubscription = orderData.type === 'subscriptions';

    if (!userEmail) {
      console.error('❌ Cannot process payment without user email');
      console.log('Order data:', JSON.stringify(orderData, null, 2));
      return false;
    }

    // Calculate expiry date based on payment type
    let expiryDate;
    let nextRenewalDate = null;

    if (isSubscription) {
      // For subscriptions, use renews_at from Lemon Squeezy
      if (orderData.attributes.renews_at) {
        expiryDate = admin.firestore.Timestamp.fromDate(new Date(orderData.attributes.renews_at));
        nextRenewalDate = admin.firestore.Timestamp.fromDate(new Date(orderData.attributes.renews_at));
      } else {
        // Fallback: 1 month from now
        expiryDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      }
    } else {
      // For one-time payments, set expiry to 1 year from now
      expiryDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
    }

    // Update user to premium status
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: true,
      subscriptionId: orderId,
      premiumExpiry: expiryDate,
      paymentMethod: 'lemon_squeezy',
      paymentType: isSubscription ? 'subscription' : 'one_time',
      subscriptionStatus: isSubscription ? 'active' : null,
      paymentDate: admin.firestore.FieldValue.serverTimestamp(),
      nextRenewalDate: nextRenewalDate,
      hasEverBeenPremium: true
    });

    console.log(`✅ Premium activated for user: ${userEmail} via Lemon Squeezy ${isSubscription ? 'subscription' : 'order'}: ${orderId}, expiry: ${expiryDate.toDate()}`);
    return true;
  } catch (error) {
    console.error('Error processing successful payment:', error);
    return false;
  }
};

// Process subscription renewal (when user pays monthly)
const processSubscriptionRenewal = async (subscriptionData) => {
  try {
    const userEmail = extractUserEmailFromWebhook(subscriptionData);
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('❌ No user email found in subscription data');
      console.log('Subscription data:', JSON.stringify(subscriptionData, null, 2));
      return false;
    }

    // Use Lemon Squeezy's renews_at date instead of calculating ourselves
    let expiryDate;
    let nextRenewalDate = null;

    if (subscriptionData.attributes.renews_at) {
      // Use the next renewal date from Lemon Squeezy
      expiryDate = admin.firestore.Timestamp.fromDate(new Date(subscriptionData.attributes.renews_at));
      nextRenewalDate = admin.firestore.Timestamp.fromDate(new Date(subscriptionData.attributes.renews_at));
    } else {
      // Fallback: calculate 30 days from now
      expiryDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    }

    // Update user premium status with new expiry
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: true,
      subscriptionId: subscriptionId,
      premiumExpiry: expiryDate,
      paymentMethod: 'lemon_squeezy',
      paymentType: 'subscription',
      subscriptionStatus: 'active',
      lastRenewalDate: admin.firestore.FieldValue.serverTimestamp(),
      nextRenewalDate: nextRenewalDate,
      hasEverBeenPremium: true,
      // Clear trial data if converting from trial
      trialStartDate: admin.firestore.FieldValue.delete()
    });

    console.log(`🔄 Subscription renewed for user: ${userEmail}, subscription: ${subscriptionId}, new expiry: ${expiryDate.toDate()}, next renewal: ${subscriptionData.attributes.renews_at}`);
    return true;
  } catch (error) {
    console.error('Error processing subscription renewal:', error);
    return false;
  }
};

// Simple check if user has used trial before
const hasUsedTrial = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user - never used trial
      return false;
    }

    const userData = userDoc.data();
    const trialCount = userData.trialCount || 0;

    // Return true if user has used trial before
    return trialCount > 0;
  } catch (error) {
    console.error('Error checking trial usage:', error);
    return false; // Default to allowing trial if error
  }
};

// Check if user has exceeded trial limit
const checkTrialAbuse = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user - allow trial
      return { canStartTrial: true, trialCount: 0, maxTrials: 1 };
    }

    const userData = userDoc.data();
    const trialCount = userData.trialCount || 0;
    const maxTrials = 1; // Only allow 1 trial per user

    // Check if user has already used their trial based on trialCount
    if (trialCount >= maxTrials) {
      console.log(`🚫 Trial abuse detected for user: ${userEmail}, trial count: ${trialCount}/${maxTrials}`);
      return { canStartTrial: false, trialCount: trialCount, maxTrials: maxTrials };
    }

    // Check if user has ever used a trial or premium subscription
    const cancellationReason = userData.cancellationReason;
    const subscriptionStatus = userData.subscriptionStatus;
    const paymentType = userData.paymentType;
    const hasEverBeenPremium = userData.hasEverBeenPremium || false;

    console.log(`🔍 Checking user history for ${userEmail}:`, {
      trialCount,
      cancellationReason,
      subscriptionStatus,
      paymentType,
      hasEverBeenPremium
    });

    // If user has cancelled a trial (regardless of when), they have used their trial
    if (cancellationReason === 'trial_cancelled' ||
      (subscriptionStatus === 'cancelled' && paymentType === 'trial')) {
      console.log(`🚫 Trial abuse detected for user: ${userEmail} - has used trial before (cancellation reason: ${cancellationReason})`);
      return {
        canStartTrial: false,
        trialCount: 1, // Mark as used trial
        maxTrials: maxTrials,
        reason: 'trial_already_used'
      };
    }

    // NEW: If user has ever been premium (even if cancelled), they cannot use trial
    if (hasEverBeenPremium ||
      (subscriptionStatus === 'cancelled' && (paymentType === 'subscription' || paymentType === 'one_time')) ||
      (cancellationReason && cancellationReason !== 'trial_cancelled')) {
      console.log(`🚫 Trial abuse detected for user: ${userEmail} - has been premium before (hasEverBeenPremium: ${hasEverBeenPremium}, paymentType: ${paymentType}, cancellationReason: ${cancellationReason})`);
      return {
        canStartTrial: false,
        trialCount: 1, // Mark as used trial
        maxTrials: maxTrials,
        reason: 'premium_already_used'
      };
    }

    // Additional check: If user has cancelled trial recently (within 24 hours), block new trial
    const lastTrialStartDate = userData.lastTrialStartDate;
    const trialCancelledDate = userData.trialCancelledDate;

    if (lastTrialStartDate && trialCancelledDate) {
      const lastTrialTime = lastTrialStartDate.toDate ? lastTrialStartDate.toDate() : new Date(lastTrialStartDate);
      const cancelTime = trialCancelledDate.toDate ? trialCancelledDate.toDate() : new Date(trialCancelledDate);
      const now = new Date();

      // If trial was cancelled within 24 hours, block new trial
      const timeDiff = now - cancelTime;
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        console.log(`🚫 Trial abuse detected for user: ${userEmail} - cancelled trial within 24 hours (${hoursDiff.toFixed(2)} hours ago)`);
        return { canStartTrial: false, trialCount: trialCount, maxTrials: maxTrials, reason: 'recent_cancellation' };
      }
    }

    return { canStartTrial: true, trialCount: trialCount, maxTrials: maxTrials };
  } catch (error) {
    console.error('Error checking trial abuse:', error);
    return { canStartTrial: false, trialCount: 0, maxTrials: 1 };
  }
};

// Process free trial start
const processFreeTrialStart = async (subscriptionData) => {
  try {
    const userEmail = extractUserEmailFromWebhook(subscriptionData);
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('❌ No user email found in subscription data');
      console.log('Subscription data:', JSON.stringify(subscriptionData, null, 2));
      return false;
    }

    // Check for trial abuse before starting trial
    const trialCheck = await checkTrialAbuse(userEmail);
    if (!trialCheck.canStartTrial) {
      console.log(`🚫 Blocking trial start for user: ${userEmail} - already used ${trialCheck.trialCount}/${trialCheck.maxTrials} trials`);

      // Update subscription status to cancelled due to abuse
      const userRef = db.collection('users').doc(userEmail);
      await userRef.update({
        subscriptionStatus: 'cancelled',
        cancellationReason: 'trial_abuse_detected',
        cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
        abuseDetected: true,
        abuseReason: 'multiple_trial_attempts'
      });

      return false;
    }

    // Use Lemon Squeezy's trial_ends_at date
    let trialExpiryDate;
    let nextRenewalDate = null;

    if (subscriptionData.attributes.trial_ends_at) {
      trialExpiryDate = admin.firestore.Timestamp.fromDate(new Date(subscriptionData.attributes.trial_ends_at));
    } else {
      // Fallback: calculate 7 days from now
      trialExpiryDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    }

    // Set next renewal date (when trial converts to paid)
    if (subscriptionData.attributes.renews_at) {
      nextRenewalDate = admin.firestore.Timestamp.fromDate(new Date(subscriptionData.attributes.renews_at));
    }

    // Update user premium status for trial
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: true,
      subscriptionId: subscriptionId,
      premiumExpiry: trialExpiryDate,
      paymentMethod: 'lemon_squeezy',
      paymentType: 'trial',
      trialStartDate: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionStatus: 'trialing',
      nextRenewalDate: nextRenewalDate,
      trialCount: admin.firestore.FieldValue.increment(1),
      lastTrialStartDate: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`🆓 Free trial started for user: ${userEmail}, subscription: ${subscriptionId}, trial expiry: ${trialExpiryDate.toDate()}, trial count: ${trialCheck.trialCount + 1}`);
    return true;
  } catch (error) {
    console.error('Error processing free trial start:', error);
    return false;
  }
};

// Process subscription cancellation
const processSubscriptionCancellation = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    console.log(`🔄 Processing subscription cancellation for user: ${userEmail}`);
    console.log(`📋 Subscription data:`, JSON.stringify(subscriptionData.attributes, null, 2));

    const userRef = db.collection('users').doc(userEmail);

    // Check if this is a trial cancellation
    const isTrial = subscriptionData.attributes.trial_ends_at &&
      new Date(subscriptionData.attributes.trial_ends_at) > new Date();

    if (isTrial) {
      // For trial cancellations, revoke access immediately
      console.log(`🆓 Trial cancellation - revoking access immediately`);
      await userRef.update({
        isPremium: false,
        premiumExpiry: null,
        paymentMethod: null,
        orderId: null,
        paymentType: null,
        subscriptionStatus: 'cancelled',
        cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
        cancellationReason: subscriptionData.attributes.cancellation_reason || 'trial_cancelled',
        trialCancelledDate: admin.firestore.FieldValue.serverTimestamp() // Track trial cancellation specifically
      });
    } else {
      // For paid subscriptions, let them use until end of billing period
      const endsAt = subscriptionData.attributes.ends_at;
      let expiryDate = null;

      if (endsAt) {
        expiryDate = admin.firestore.Timestamp.fromDate(new Date(endsAt));
        console.log(`💰 Paid subscription cancellation - access until: ${endsAt}`);
      } else {
        // If no end date, revoke immediately
        console.log(`⚠️ No end date found - revoking access immediately`);
        expiryDate = admin.firestore.Timestamp.fromDate(new Date());
      }

      await userRef.update({
        premiumExpiry: expiryDate,
        subscriptionStatus: 'cancelled',
        cancellationDate: admin.firestore.FieldValue.serverTimestamp(),
        cancellationReason: subscriptionData.attributes.cancellation_reason || 'user_cancelled',
        subscriptionEndsAt: endsAt ? admin.firestore.Timestamp.fromDate(new Date(endsAt)) : null
      });
    }

    console.log(`❌ Subscription cancelled for user: ${userEmail}, subscription: ${subscriptionId}, isTrial: ${isTrial}`);
    return true;
  } catch (error) {
    console.error('Error processing subscription cancellation:', error);
    return false;
  }
};

// Process subscription expiration
const processSubscriptionExpiration = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    console.log(`⏰ Processing subscription expiration for user: ${userEmail}`);

    // Revoke premium access immediately when subscription expires
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: false,
      premiumExpiry: null,
      paymentMethod: null,
      orderId: null,
      paymentType: null,
      subscriptionStatus: 'expired',
      expirationDate: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`⏰ Subscription expired for user: ${userEmail}, subscription: ${subscriptionId}`);
    return true;
  } catch (error) {
    console.error('Error processing subscription expiration:', error);
    return false;
  }
};

// Process subscription pause
const processSubscriptionPause = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    // Pause premium access immediately
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: false,
      subscriptionStatus: 'paused',
      pauseDate: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`⏸️ Subscription paused for user: ${userEmail}, subscription: ${subscriptionId}`);
    return true;
  } catch (error) {
    console.error('Error processing subscription pause:', error);
    return false;
  }
};

// Process subscription resume
const processSubscriptionResume = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    // Resume premium access
    const expiryDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: true,
      orderId: subscriptionId,
      premiumExpiry: expiryDate,
      paymentMethod: 'lemon_squeezy',
      orderId: subscriptionId,
      paymentType: 'subscription',
      subscriptionStatus: 'active',
      resumeDate: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`▶️ Subscription resumed for user: ${userEmail}, subscription: ${subscriptionId}`);
    return true;
  } catch (error) {
    console.error('Error processing subscription resume:', error);
    return false;
  }
};

// Process order refund (one-time payment) - NO REFUND POLICY
const processOrderRefund = async (orderData) => {
  try {
    const userEmail = orderData.attributes.user_email || orderData.attributes.email;
    const orderId = orderData.id;
    const refundAmount = orderData.attributes.total || 0;

    if (!userEmail) {
      console.error('No user email found in order data');
      return false;
    }

    console.log(`🚫 REFUND ATTEMPTED - NO REFUND POLICY`);
    console.log(`💰 Order refund attempted for user: ${userEmail}, order: ${orderId}, amount: $${refundAmount}`);

    // Log the refund attempt but DO NOT revoke access
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      refundAttemptDate: admin.firestore.FieldValue.serverTimestamp(),
      refundAmount: refundAmount,
      refundReason: 'order_refunded_but_denied',
      refundStatus: 'denied',
      refundPolicy: 'no_refund'
    });

    console.log(`🚫 Refund denied for user: ${userEmail} - No refund policy applies`);
    return true;
  } catch (error) {
    console.error('Error processing order refund:', error);
    return false;
  }
};

// Process subscription payment refund - NO REFUND POLICY
const processSubscriptionRefund = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;
    const refundAmount = subscriptionData.attributes.total || 0;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    console.log(`🚫 SUBSCRIPTION REFUND ATTEMPTED - NO REFUND POLICY`);
    console.log(`💰 Subscription refund attempted for user: ${userEmail}, subscription: ${subscriptionId}, amount: $${refundAmount}`);

    // Log the refund attempt but DO NOT revoke access
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      refundAttemptDate: admin.firestore.FieldValue.serverTimestamp(),
      refundAmount: refundAmount,
      refundReason: 'subscription_payment_refunded_but_denied',
      refundStatus: 'denied',
      refundPolicy: 'no_refund'
    });

    console.log(`🚫 Subscription refund denied for user: ${userEmail} - No refund policy applies`);
    return true;
  } catch (error) {
    console.error('Error processing subscription refund:', error);
    return false;
  }
};

// Process subscription cancellation due to refund - NO REFUND POLICY
const processSubscriptionCancellationRefund = async (subscriptionData) => {
  try {
    const userEmail = subscriptionData.attributes.user_email || subscriptionData.attributes.email;
    const subscriptionId = subscriptionData.id;

    if (!userEmail) {
      console.error('No user email found in subscription data');
      return false;
    }

    console.log(`🚫 CANCELLATION DUE TO REFUND ATTEMPTED - NO REFUND POLICY`);
    console.log(`💰 Subscription cancellation due to refund attempted for user: ${userEmail}, subscription: ${subscriptionId}`);

    // Log the cancellation attempt but DO NOT revoke access
    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      refundAttemptDate: admin.firestore.FieldValue.serverTimestamp(),
      refundReason: 'cancellation_due_to_refund_but_denied',
      refundStatus: 'denied',
      refundPolicy: 'no_refund',
      cancellationReason: 'refund_requested_but_denied'
    });

    console.log(`🚫 Subscription cancellation due to refund denied for user: ${userEmail} - No refund policy applies`);
    return true;
  } catch (error) {
    console.error('Error processing subscription cancellation refund:', error);
    return false;
  }
};






// Check user usage
const checkUserUsage = async (userEmail, isWorkspaceRequest = false) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user
      await userRef.set({
        usage: 0,
        lastReset: getCurrentDateString(),
        workspaceUsage: 0,
        workspaceLastReset: getCurrentDateString(),
        isPremium: false,
        premiumExpiry: null,
        shareUsage: 0,
        shareLastReset: getCurrentDateString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (isWorkspaceRequest) {
        return { canUse: true, remaining: 4, used: 0, limit: 4, percentage: 0, isPremium: false, isWorkspace: true };
      }
      return { canUse: true, remaining: 15, used: 0, limit: 15, percentage: 0, isPremium: false };
    }

    const userData = userDoc.data();
    const currentDate = getCurrentDateString();

    // Check if premium and not expired
    const isPremiumActive = userData.isPremium && !isPremiumExpired(userData.premiumExpiry);

    // If premium but expired, reset to free user
    if (userData.isPremium && isPremiumExpired(userData.premiumExpiry)) {
      await userRef.update({
        isPremium: false,
        premiumExpiry: null,
        paymentMethod: null,
        orderId: null,
        paymentType: null
      });
      console.log(`Premium expired for user: ${userEmail}`);
    }

    // Premium users have unlimited access
    if (isPremiumActive) {
      if (isWorkspaceRequest) {
        return { canUse: true, remaining: -1, used: userData.workspaceUsage || 0, limit: -1, percentage: 100, isPremium: true, isWorkspace: true };
      }
      return { canUse: true, remaining: -1, used: userData.usage, limit: -1, percentage: 100, isPremium: true };
    }

    // Reset if new day (for both workspace and regular usage)
    if (userData.lastReset !== currentDate) {
      await userRef.update({
        usage: 0,
        workspaceUsage: 0,
        lastReset: currentDate,
        workspaceLastReset: currentDate
      });

      if (isWorkspaceRequest) {
        return { canUse: true, remaining: 4, used: 0, limit: 4, totalUsed: 0, totalLimit: 15, percentage: 0, isPremium: false, isWorkspace: true };
      }
      return { canUse: true, remaining: 15, used: 0, limit: 15, percentage: 0, isPremium: false };
    }

    const totalUsage = userData.usage || 0;
    const workspaceUsage = userData.workspaceUsage || 0;

    // For AI Workspace requests (synthesize endpoint)
    if (isWorkspaceRequest) {
      // Check both workspace limit (4) AND total AI limit (15)
      const workspaceRemaining = 4 - workspaceUsage;
      const totalRemaining = 15 - totalUsage;
      const canUse = workspaceRemaining > 0 && totalRemaining > 0;

      // If total limit reached, show total limit message
      if (totalRemaining <= 0) {
        return {
          canUse: false,
          remaining: 0,
          used: workspaceUsage,
          limit: 4,
          totalUsed: totalUsage,
          totalLimit: 15,
          percentage: 100,
          isPremium: false,
          isWorkspace: true,
          reason: 'total_limit_reached'
        };
      }

      // If workspace limit reached, show workspace limit message
      if (workspaceRemaining <= 0) {
        return {
          canUse: false,
          remaining: 0,
          used: workspaceUsage,
          limit: 4,
          totalUsed: totalUsage,
          totalLimit: 15,
          percentage: 100,
          isPremium: false,
          isWorkspace: true,
          reason: 'workspace_limit_reached'
        };
      }

      return {
        canUse: true,
        remaining: Math.max(0, workspaceRemaining),
        used: workspaceUsage,
        limit: 4,
        totalUsed: totalUsage,
        totalLimit: 15,
        percentage: Math.round((workspaceUsage / 4) * 100),
        isPremium: false,
        isWorkspace: true
      };
    }

    // For regular AI requests (chat, summarize, etc.)
    // Check total daily limit (15 requests)
    const remaining = 15 - totalUsage;
    const percentage = Math.round((totalUsage / 15) * 100);

    return {
      canUse: remaining > 0,
      remaining: Math.max(0, remaining),
      used: totalUsage,
      limit: 15,
      percentage: percentage,
      isPremium: false
    };
  } catch (error) {
    console.error('Error checking user usage:', error);
    return { canUse: false, remaining: 0, used: 0, limit: isWorkspaceRequest ? 4 : 15, percentage: 0, isPremium: false, isWorkspace: isWorkspaceRequest };
  }
};

// Check user share usage (1 share per day for regular users, unlimited for premium)
const checkUserShareUsage = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user
      await userRef.set({
        usage: 0,
        lastReset: getCurrentDateString(),
        isPremium: false,
        premiumExpiry: null,
        shareUsage: 0,
        shareLastReset: getCurrentDateString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { canShare: true, remaining: 1, used: 0, limit: 1, isPremium: false };
    }

    const userData = userDoc.data();
    const currentDate = getCurrentDateString();

    // Reset share usage if new day
    if (userData.shareLastReset !== currentDate) {
      await userRef.update({
        shareUsage: 0,
        shareLastReset: currentDate
      });
      return { canShare: true, remaining: 1, used: 0, limit: 1, isPremium: userData.isPremium };
    }

    // Check if premium and not expired - unlimited shares
    if (userData.isPremium && !isPremiumExpired(userData.premiumExpiry)) {
      return { canShare: true, remaining: -1, used: userData.shareUsage || 0, limit: -1, isPremium: true };
    }

    // If premium but expired, reset to free user
    if (userData.isPremium && isPremiumExpired(userData.premiumExpiry)) {
      await userRef.update({
        isPremium: false,
        premiumExpiry: null,
        paymentMethod: null,
        orderId: null,
        paymentType: null
      });
      console.log(`Premium expired for user: ${userEmail} (share usage check)`);
    }

    // Check daily share limit (1 share per day for regular users)
    const shareUsage = userData.shareUsage || 0;
    const remaining = 1 - shareUsage;

    return {
      canShare: remaining > 0,
      remaining: Math.max(0, remaining),
      used: shareUsage,
      limit: 1,
      isPremium: false
    };
  } catch (error) {
    console.error('Error checking user share usage:', error);
    return { canShare: false, remaining: 0, used: 0, limit: 1, isPremium: false };
  }
};



// Increment user usage
const incrementUserUsage = async (userEmail, isWorkspaceRequest = false) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();

      // Don't increment if premium
      if (userData.isPremium) {
        return true;
      }

      // Increment workspace usage for synthesize requests
      // Workspace requests count towards BOTH workspace limit AND total AI limit
      if (isWorkspaceRequest) {
        await userRef.update({
          workspaceUsage: admin.firestore.FieldValue.increment(1),
          usage: admin.firestore.FieldValue.increment(1) // Also count towards total
        });
      } else {
        // Increment regular usage only
        await userRef.update({
          usage: admin.firestore.FieldValue.increment(1)
        });
      }
    }
    return true;
  } catch (error) {
    console.error('Error incrementing user usage:', error);
    return false;
  }
};

// Increment user share usage
const incrementUserShareUsage = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();

      // Don't increment if premium
      if (userData.isPremium) {
        return true;
      }

      // Increment share usage
      await userRef.update({
        shareUsage: admin.firestore.FieldValue.increment(1)
      });
    }
    return true;
  } catch (error) {
    console.error('Error incrementing user share usage:', error);
    return false;
  }
};

// Check user image analysis usage (1 analysis per day for regular users, unlimited for premium)
const checkUserImageAnalysisUsage = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user
      await userRef.set({
        usage: 0,
        lastReset: getCurrentDateString(),
        isPremium: false,
        premiumExpiry: null,
        shareUsage: 0,
        shareLastReset: getCurrentDateString(),
        imageAnalysisUsage: 0,
        imageAnalysisLastReset: getCurrentDateString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return { canAnalyze: true, remaining: 1, used: 0, limit: 1, isPremium: false };
    }

    const userData = userDoc.data();
    const currentDate = getCurrentDateString();

    // Reset image analysis usage if new day
    if (userData.imageAnalysisLastReset !== currentDate) {
      await userRef.update({
        imageAnalysisUsage: 0,
        imageAnalysisLastReset: currentDate
      });
      return { canAnalyze: true, remaining: 1, used: 0, limit: 1, isPremium: userData.isPremium };
    }

    // Check if premium and not expired - unlimited image analysis
    if (userData.isPremium && !isPremiumExpired(userData.premiumExpiry)) {
      return { canAnalyze: true, remaining: -1, used: userData.imageAnalysisUsage || 0, limit: -1, isPremium: true };
    }

    // If premium but expired, reset to free user
    if (userData.isPremium && isPremiumExpired(userData.premiumExpiry)) {
      await userRef.update({
        isPremium: false,
        premiumExpiry: null,
        paymentMethod: null,
        orderId: null,
        paymentType: null
      });
      console.log(`Premium expired for user: ${userEmail} (image analysis usage check)`);
    }

    // Check daily image analysis limit (1 analysis per day for regular users)
    const imageAnalysisUsage = userData.imageAnalysisUsage || 0;
    const remaining = 1 - imageAnalysisUsage;

    return {
      canAnalyze: remaining > 0,
      remaining: Math.max(0, remaining),
      used: imageAnalysisUsage,
      limit: 1,
      isPremium: false
    };
  } catch (error) {
    console.error('Error checking user image analysis usage:', error);
    return { canAnalyze: false, remaining: 0, used: 0, limit: 1, isPremium: false };
  }
};

// Increment user image analysis usage
const incrementUserImageAnalysisUsage = async (userEmail) => {
  try {
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();

      // Don't increment if premium
      if (userData.isPremium) {
        return true;
      }

      // Increment image analysis usage
      await userRef.update({
        imageAnalysisUsage: admin.firestore.FieldValue.increment(1)
      });
    }
    return true;
  } catch (error) {
    console.error('Error incrementing user image analysis usage:', error);
    return false;
  }
};






// Middleware

app.use(cors({

  origin: ['chrome-extension://*'],

  credentials: true

}));



app.use(express.json());



// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT || 'video-summarizer-473606',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
});

// Helper function to get Vertex AI model
const getVertexModel = (modelName) => {
  return vertexAI.getGenerativeModel({
    model: modelName
  });
};

// Helper function to extract text from Vertex AI response
const getTextFromResponse = (response) => {
  if (!response || !response.candidates || response.candidates.length === 0) {
    return '';
  }
  const candidate = response.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    return '';
  }
  return candidate.content.parts.map(part => part.text).join('');
};

// ============================================
// MODEL SELECTION - Optimized for each task
// ============================================

/**
 * Model selection strategy:
 * - gemini-2.0-flash: Main model - best balance of speed, cost, and quality
 * - gemini-2.0-flash-lite: Lighter model for simple tasks
 */

// Model for title generation and keywords (fast, cheap)
const getTitleModel = () => {
  return 'gemini-2.0-flash-lite';
};

// Model for AI Chat (conversational, streaming-optimized)
const getChatModel = () => {
  return 'gemini-2.0-flash';
};

// Model for content processing (summarize, expand, improve, outline)
const getContentModel = () => {
  return 'gemini-2.0-flash';
};

// Model for workspace synthesis (needs large context, advanced reasoning)
const getWorkspaceModel = () => {
  return 'gemini-2.5-flash'; // Large context window for multiple notes
};

// Model for format and structure (fast, lite is enough)
const getFormatModel = () => {
  return 'gemini-2.0-flash-lite'; // Lightweight for simple formatting
};

// Model for OCR and image analysis (multimodal)
const getVisionModel = () => {
  return 'gemini-2.0-flash';
};

// Model for meeting notes and action items (structured output)
const getStructuredModel = () => {
  return 'gemini-2.0-flash';
};

// Legacy function for backward compatibility
const getContextMenuModel = () => {
  return getContentModel();
};

const getModelForUser = (isPremium) => {
  return 'gemini-2.0-flash'; // Same model for all users
};

// ============================================
// ENHANCED PROMPTS - Specialized roles with minimal rules
// ============================================

const createMultilingualPrompt = (action, content) => {
  const basePrompts = {
    summarize: `Role: Summarization specialist who distills complex information into concise summaries.

Task: Extract core message, key facts, and critical insights.

Rules:
- Respond in the SAME language as input
- Output ONLY the summary content
- NO introductory phrases
- Choose formatting that best serves the content

Content:
${content}`,

    expand: `Role: Content development specialist who enriches ideas with depth and practical insights.

Task: Transform brief content into comprehensive explanations. Add examples, context, and practical applications while maintaining original tone.

Rules:
- Respond in the SAME language as input
- Output ONLY the expanded content
- NO meta-commentary
- Choose formatting that best serves the content

Content:
${content}`,

    improve: `Role: Professional editor specializing in clarity, precision, and readability.

Task: Polish text for clarity, professionalism, and impact. Fix grammar, improve word choice, enhance flow while preserving author's voice.

Rules:
- Respond in the SAME language as input
- Output ONLY the improved version
- NO explanations of changes
- Choose formatting that best serves the content

Content:
${content}`,

    suggestions: `Role: Writing coach providing constructive, actionable feedback.

Task: Provide specific suggestions covering clarity, structure, tone, and engagement. Make each suggestion immediately actionable with examples.

Rules:
- Respond in the SAME language as input
- Output ONLY the suggestions
- NO preamble
- Choose formatting that best serves the content

Content:
${content}`,

    outline: `Role: Information architect creating clear, logical structures.

Task: Transform content into well-organized outline with clear hierarchy. Group related ideas, show relationships, make it scannable.

Rules:
- Respond in the SAME language as input
- Output ONLY the outline
- NO introductory text
- Choose formatting that best serves the content

Content:
${content}`,

    'meeting-notes': `Role: Meeting documentation specialist transforming raw notes into professional records.

Task: Create structured meeting notes capturing decisions, actions, and key points. Focus on actionable information.

Rules:
- Respond in the SAME language as input
- Output ONLY the structured notes
- NO meta-commentary
- Choose formatting that best serves the content

Content:
${content}`,

    'action-items': `Role: Task extraction specialist identifying and organizing actionable items.

Task: Find every task, deadline, and responsibility. Present as clear, actionable checklist.

Rules:
- Respond in the SAME language as input
- Use markdown task lists: [ ] for unchecked items
- Start each task with action verb
- Add context (deadlines, owners) where relevant
- Output ONLY the checklist
- NO introductory text

Content:
${content}`,

    'keywords': `Role: Content analyst identifying key themes and concepts.

Task: Extract keywords/phrases representing main topics. Keep concise.

Rules:
- Respond in the SAME language as input
- Output ONLY the keyword list
- NO labels like "Keywords:"
- Choose formatting that best serves the content

Content:
${content}`,

    'synthesize': `Role: Knowledge synthesis expert finding patterns and insights across multiple sources.

Task: Analyze notes as unified knowledge base. Identify connections, patterns, contradictions, and actionable insights. Go beyond summarization.

Rules:
- Respond in the SAME language as input
- Output ONLY the synthesis
- NO phrases like "Based on these notes"
- Choose formatting that best serves the content

Content:
${content}`,

    'tone': `Role: Tone transformation specialist adapting content to different styles.

Task: Transform text to match specified tone while preserving all information and meaning.

Rules:
- Respond in the SAME language as input
- Output ONLY the transformed text
- NO meta-commentary
- Choose formatting that best serves the content

Content:
${content}`,

  };

  return basePrompts[action] || `Respond in the SAME language as input with direct, helpful response.

${content}`;
};

// Helper function to create tone-specific prompts
const createTonePrompt = (content, tone) => {
  const toneSpecs = {
    humorous: {
      emoji: '😂',
      desc: 'Add humor, jokes, wordplay, and light-hearted language. Use emojis and casual expressions to make content entertaining.',
      hasEmoji: true
    },
    poetic: {
      emoji: '📜',
      desc: 'Use flowery language, metaphors, imagery, and rhythmic phrasing. Make content beautiful and artistic with emojis.',
      hasEmoji: true
    },
    dramatic: {
      emoji: '🎭',
      desc: 'Use exclamations, strong language, and theatrical expressions. Make content exciting and intense with emojis.',
      hasEmoji: true
    },
    genz: {
      emoji: '✨',
      desc: 'Use modern slang, abbreviations, and internet language. Make content trendy and relatable with emojis.',
      hasEmoji: true
    },
    professional: {
      emoji: '',
      desc: 'Use formal language, proper structure, and business-appropriate tone. NO emojis. Make content polished and corporate-ready.',
      hasEmoji: false
    },
    simplify: {
      emoji: '',
      desc: 'Use simple words, short sentences (15-20 words max), and clear explanations. NO emojis. Make complex content easy to understand.',
      hasEmoji: false
    }
  };

  const spec = toneSpecs[tone];
  if (!spec) throw new Error(`Invalid tone: ${tone}`);

  return `Transform the text into "${tone}" tone while preserving ALL information.

TONE: ${tone.toUpperCase()}
${spec.desc}

LANGUAGE: Detect the input language and respond in the SAME language. Adapt tone to cultural context.

CRITICAL REQUIREMENTS:
- transformedText must contain ONLY plain text (no markdown, no code blocks, no JSON syntax)
- transformedText must be the actual readable text users will see
- Include the COMPLETE transformed content - do NOT truncate
- suggestedEmoji should match the specific content (empty string for professional/simplify)
- Preserve all important information from original

OUTPUT FORMAT (valid JSON):
{
  "transformedText": "complete transformed text in plain text format",
  "suggestedEmoji": "${spec.emoji}",
  "tone": "${tone}",
  "hasEmojis": ${spec.hasEmoji},
  "isFormatted": true
}

TEXT TO TRANSFORM:
${content}

REMEMBER: Transform the ENTIRE text above. Include ALL content. Do not truncate. Maintain the SAME language as input.`;
};

// Helper function for color brightness adjustment (still needed for fallback)

function adjustColorBrightness(hex, percent) {
  // Remove the # if present
  hex = hex.replace('#', '');

  // Parse the hex color
  const num = parseInt(hex, 16);
  const r = (num >> 16) + percent;
  const g = (num >> 8 & 0x00FF) + percent;
  const b = (num & 0x0000FF) + percent;

  // Clamp values to 0-255
  const clamp = (val) => Math.max(0, Math.min(255, val));

  // Convert back to hex
  return '#' + ((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0');
}


// Enhanced authentication middleware with usage checking
const checkUserAuthAndUsage = async (req, res, next) => {
  try {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        error: 'User email required. Please sign in to use AI features.'
      });
    }

    // Check if this is a workspace request (synthesize endpoint)
    const isWorkspaceRequest = req.path.includes('/synthesize');
    const usageInfo = await checkUserUsage(userEmail, isWorkspaceRequest);

    if (!usageInfo.canUse) {
      let errorMessage;

      if (isWorkspaceRequest) {
        // Check which limit was reached
        if (usageInfo.reason === 'total_limit_reached') {
          errorMessage = `Daily AI usage limit reached (${usageInfo.totalLimit} requests per day). Please try again tomorrow or upgrade to Premium for unlimited access!`;
        } else {
          errorMessage = `Daily AI Workspace limit reached (${usageInfo.limit} requests per day). Upgrade to Premium for unlimited access!`;
        }
      } else {
        errorMessage = `Daily AI usage limit reached (${usageInfo.limit} requests per day). Please try again tomorrow or upgrade to premium.`;
      }

      return res.status(429).json({
        success: false,
        error: errorMessage,
        usage: usageInfo
      });
    }

    // Add usage info to request
    req.userEmail = userEmail;
    req.usageInfo = usageInfo;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication check failed'
    });
  }
};

// Share note authentication middleware with share usage checking
const checkUserAuthAndShareUsage = async (req, res, next) => {
  try {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        error: 'User email required. Please sign in to share notes.'
      });
    }

    const shareUsageInfo = await checkUserShareUsage(userEmail);

    if (!shareUsageInfo.canShare) {
      return res.status(429).json({
        success: false,
        error: `Daily share limit reached (${shareUsageInfo.limit} share per day). Please try again tomorrow or upgrade to premium for unlimited sharing.`,
        usage: shareUsageInfo
      });
    }

    // Add usage info to request
    req.userEmail = userEmail;
    req.shareUsageInfo = shareUsageInfo;
    next();
  } catch (error) {
    console.error('Share auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication check failed'
    });
  }
};

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// --- API ENDPOINTS ---

// Root endpoint to check if server is running
app.get('/', (req, res) => {
  res.status(200).send('Quick Note Premium Server is running!');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    region: process.env.GOOGLE_CLOUD_LOCATION || 'unknown'
  });
});


// 1. SYNC NOTE TO FIREBASE ENDPOINT (KEEP FROM YOUR ORIGINAL CODE)
app.post('/api/notes/:noteId/sync', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userEmail = req.userEmail;
    const noteData = req.body;

    const noteRef = db.collection('users').doc(userEmail).collection('notes').doc(noteId);
    await noteRef.set(noteData, { merge: true }); // Use { merge: true } to update or create new

    console.log(`Note ${noteId} synced for user ${userEmail}`);
    res.json({ success: true, message: 'Note synced successfully' });

  } catch (error) {
    console.error('Error syncing note:', error);
    res.status(500).json({ success: false, error: 'Failed to sync note' });
  }
});

// 2. CREATE SHARE LINK ENDPOINT (UPGRADED WITH IMAGE PROCESSING)
app.post('/api/notes/:noteId/share', checkUserAuthAndShareUsage, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userEmail = req.userEmail;

    const noteRef = db.collection('users').doc(userEmail).collection('notes').doc(noteId);
    const noteDoc = await noteRef.get();
    if (!noteDoc.exists) {
      return res.status(404).json({ success: false, error: `Note with ID ${noteId} not found.` });
    }

    const noteData = noteDoc.data();
    let contentHTML = noteData.content;
    // Always generate a new shareId to ensure fresh content on each share
    let shareId = crypto.randomBytes(8).toString('hex');
    console.log('Generated new shareId:', shareId);

    // Validate HTML content
    if (!contentHTML || typeof contentHTML !== 'string') {
      console.warn('Invalid HTML content, using fallback');
      contentHTML = '<p>Content not available</p>';
    }

    console.log('Note data retrieved successfully:', {
      noteId: noteId,
      hasContent: !!contentHTML,
      contentLength: contentHTML.length,
      existingShareId: !!noteData.shareId
    });

    // Base64 image processing logic with detailed error handling
    console.log('Starting image processing for note:', noteId);
    console.log('Content HTML length:', contentHTML.length);
    console.log('Content preview:', contentHTML.substring(0, 200) + '...');

    try {
      const dom = new JSDOM(contentHTML);
      const images = dom.window.document.querySelectorAll('img');
      console.log(`Found ${images.length} images to process`);

      if (images.length > 0) {
        const uploadPromises = [];
        let processedImages = 0;

        images.forEach((img, index) => {
          const src = img.getAttribute('src');
          console.log(`Processing image ${index + 1}: ${src ? 'has src' : 'no src'}`);
          console.log(`Image src preview: ${src ? src.substring(0, 100) + '...' : 'no src'}`);

          if (src && src.startsWith('data:image/')) {
            const promise = (async () => {
              try {
                console.log(`Starting upload for image ${index + 1}`);

                // Validate MIME type
                const mimeTypeMatch = src.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
                if (!mimeTypeMatch) {
                  console.warn(`Invalid MIME type for image ${index + 1}:`, src.substring(0, 50) + '...');
                  return;
                }

                const mimeType = mimeTypeMatch[1];
                console.log(`MIME type for image ${index + 1}:`, mimeType);

                // Validate base64 data
                const base64Data = src.replace(/^data:image\/\w+;base64,/, "");
                if (!base64Data || base64Data.length === 0) {
                  console.warn(`Empty base64 data for image ${index + 1}`);
                  return;
                }

                // Additional validation for base64 data
                if (base64Data.length < 100) {
                  console.warn(`Base64 data too short for image ${index + 1}: ${base64Data.length} chars`);
                  return;
                }

                // Check if base64 data is valid
                const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
                if (!base64Regex.test(base64Data)) {
                  console.warn(`Invalid base64 data for image ${index + 1}`);
                  return;
                }

                // Create buffer and validate
                let buffer;
                try {
                  buffer = Buffer.from(base64Data, 'base64');
                  if (buffer.length === 0) {
                    console.warn(`Empty buffer for image ${index + 1}`);
                    return;
                  }
                } catch (bufferError) {
                  console.error(`Buffer creation failed for image ${index + 1}:`, bufferError.message);
                  return;
                }

                // Generate filename
                const fileExtension = mimeType.split('/')[1] || 'png';
                const fileName = `shared_images/${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
                console.log(`Uploading to: ${fileName}`);

                // Upload to Firebase Storage
                const file = bucket.file(fileName);
                await file.save(buffer, {
                  metadata: {
                    contentType: mimeType,
                    cacheControl: 'public, max-age=31536000'
                  },
                  public: true
                });

                // Get public URL
                const publicUrl = file.publicUrl();
                console.log(`Upload successful for image ${index + 1}: ${publicUrl}`);

                // Update image src
                img.setAttribute('src', publicUrl);
                processedImages++;

              } catch (uploadError) {
                console.error(`Upload failed for image ${index + 1}:`, uploadError.message);
                console.error('Upload error details:', uploadError);
                // Continue processing other images even if one fails
              }
            })();
            uploadPromises.push(promise);
          }
        });

        // Wait for all uploads to complete (or fail)
        console.log(`Waiting for ${uploadPromises.length} image uploads to complete`);
        await Promise.allSettled(uploadPromises);
        console.log(`Image processing completed. Successfully processed: ${processedImages}/${images.length} images`);

        // Update content HTML with processed images
        contentHTML = dom.window.document.body.innerHTML;
      } else {
        console.log('No images found in content');
      }
    } catch (imageProcessingError) {
      console.error('Image processing failed:', imageProcessingError);
      console.error('Image processing error details:', imageProcessingError);
      // Continue with original content if image processing fails
      console.log('Continuing with original content due to image processing failure');
    }

    // Save shared note to database (always create new share with new ID)
    console.log('Creating new shared note with ID:', shareId);
    const sharedNoteRef = db.collection('shared_notes').doc(shareId);
    await sharedNoteRef.set({
      contentHTML: contentHTML,
      color: noteData.color || '#8b9dc3',
      size: noteData.size || { width: 584, height: 792 }, // Save window size
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      noteId: noteId,
      userEmail: userEmail
    });

    // Update original note with latest shareId
    await noteRef.update({
      shareId: shareId,
      lastSharedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('Shared note saved successfully with new ID:', shareId);

    // Increment share usage for regular users
    await incrementUserShareUsage(userEmail);

    // Generate shareable link using the current backend URL
    // This will automatically use the correct region URL
    const baseUrl = process.env.BACKEND_URL || req.protocol + '://' + req.get('host');
    const shareableLink = `${baseUrl}/view/${shareId}`;

    res.json({ success: true, link: shareableLink });

  } catch (error) {
    console.error('Error during sharing process:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      noteId: noteId,
      userEmail: userEmail
    });

    // Provide more specific error messages
    let errorMessage = 'Failed to process share request.';
    if (error.message.includes('storage')) {
      errorMessage = 'Storage service error. Please try again.';
    } else if (error.message.includes('permission')) {
      errorMessage = 'Permission denied. Please check your account.';
    } else if (error.message.includes('network')) {
      errorMessage = 'Network error. Please check your connection.';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 3. VIEW PUBLIC NOTE ENDPOINT - REDIRECT TO EXTENSION OR CHROME WEB STORE
app.get('/view/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const sharedNoteRef = db.collection('shared_notes').doc(shareId);
    const doc = await sharedNoteRef.get();
    
    if (!doc.exists) {
      return res.status(404).send('<h1>Note does not exist or sharing has been cancelled.</h1>');
    }

    // Generate extension deep link
    const extensionId = 'afdbnkkbgejpbkkbbcjjpdpbachaidkm'; // Your extension ID
    const extensionDeepLink = `chrome-extension://${extensionId}/note/note.html?shareId=${shareId}`;
    const chromeWebStoreLink = 'https://chromewebstore.google.com/detail/afdbnkkbgejpbkkbbcjjpdpbachaidkm';

    // Return HTML that attempts to open extension, falls back to Chrome Web Store
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Opening Quick Notes...</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #ffffff;
            color: #333333;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: #f8f9fa;
            border-radius: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            max-width: 500px;
        }
        h1 {
            margin-bottom: 20px;
            font-size: 28px;
            color: #1a1a1a;
        }
        p {
            margin-bottom: 30px;
            font-size: 16px;
            color: #666666;
        }
        .btn {
            display: inline-block;
            padding: 12px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 25px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .spinner {
            border: 3px solid #e0e0e0;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Opening Quick Notes...</h1>
        <div class="spinner"></div>
        <p id="message">Checking if you have Quick Notes installed...</p>
        <a href="${chromeWebStoreLink}" class="btn" id="install-btn" style="display:none;">Install Quick Notes Extension</a>
    </div>
    <script>
        const shareId = '${shareId}';
        const extensionId = '${extensionId}';
        const chromeWebStoreLink = '${chromeWebStoreLink}';
        
        // Try to communicate with extension
        let extensionInstalled = false;
        let checkTimeout;
        
        // Function to check if extension is installed
        function checkExtension() {
            try {
                // Try to send message to extension
                chrome.runtime.sendMessage(extensionId, { action: 'ping' }, function(response) {
                    if (chrome.runtime.lastError) {
                        // Extension not installed
                        showInstallButton();
                    } else {
                        // Extension is installed, open the note
                        extensionInstalled = true;
                        openInExtension();
                    }
                });
            } catch (e) {
                // chrome.runtime not available (not in Chrome or extension not installed)
                showInstallButton();
            }
        }
        
        function openInExtension() {
            document.getElementById('message').textContent = 'Opening note in Quick Notes...';
            
            // Send message to extension to open the shared note
            chrome.runtime.sendMessage(extensionId, {
                action: 'openSharedNote',
                shareId: shareId
            }, function(response) {
                if (chrome.runtime.lastError || !response || !response.success) {
                    // Failed to open, show install button
                    showInstallButton();
                } else {
                    // Successfully opened
                    document.getElementById('message').textContent = 'Note opened successfully!';
                    setTimeout(() => {
                        window.close(); // Try to close the tab
                    }, 1000);
                }
            });
        }
        
        function showInstallButton() {
            document.querySelector('.spinner').style.display = 'none';
            document.getElementById('message').textContent = 'Quick Notes extension is not installed.';
            document.getElementById('install-btn').style.display = 'inline-block';
            
            // Auto-redirect after 3 seconds
            setTimeout(() => {
                window.location.href = chromeWebStoreLink;
            }, 3000);
        }
        
        // Check extension on page load
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            checkExtension();
            
            // Fallback timeout
            checkTimeout = setTimeout(() => {
                if (!extensionInstalled) {
                    showInstallButton();
                }
            }, 2000);
        } else {
            // Not in Chrome browser
            showInstallButton();
        }
    </script>
</body>
</html>
    `);
  } catch (error) {
    console.error('Error viewing shared note:', error);
    res.status(500).send('<h1>Error loading note. Please try again later.</h1>');
  }
});

// 4. API ENDPOINT TO GET SHARED NOTE DATA (for extension)
app.get('/api/shared-notes/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const sharedNoteRef = db.collection('shared_notes').doc(shareId);
    const doc = await sharedNoteRef.get();
    
    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Shared note not found'
      });
    }

    const noteData = doc.data();
    
    // Return note data as JSON
    res.json({
      success: true,
      note: {
        contentHTML: noteData.contentHTML,
        color: noteData.color || '#8b9dc3',
        size: noteData.size || { width: 584, height: 792 }, // Return window size
        createdAt: noteData.createdAt,
        lastUpdatedAt: noteData.lastUpdatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching shared note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shared note'
    });
  }
});



// --- OTHER AI APIs ---


// Usage check endpoint
app.get('/api/usage/check', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];

    if (!userEmail) {
      return res.status(401).json({
        success: false,
        error: 'User email required'
      });
    }

    const usageInfo = await checkUserUsage(userEmail);
    res.json({ success: true, usage: usageInfo });
  } catch (error) {
    console.error('Usage check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AI ENDPOINTS - Optimized with specialized models
// ============================================

app.post('/api/ai/summarize', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getContentModel()); // Use content-optimized model

    const prompt = createMultilingualPrompt('summarize', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/expand', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getContentModel()); // Use content-optimized model

    const prompt = createMultilingualPrompt('expand', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/improve', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getContentModel()); // Use content-optimized model

    const prompt = createMultilingualPrompt('improve', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/ai/suggestions', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getContentModel()); // Use content-optimized model

    const prompt = createMultilingualPrompt('suggestions', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/outline', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getContentModel()); // Use content-optimized model

    const prompt = createMultilingualPrompt('outline', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/keywords', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    const model = getVertexModel(getTitleModel()); // Use fast model for keywords

    const prompt = createMultilingualPrompt('keywords', content);
    const result = await model.generateContent(prompt);
    const response = result.response;

    // Increment usage after successful AI request
    await incrementUserUsage(req.userEmail);

    res.json({ success: true, result: getTextFromResponse(response) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/meeting-notes', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getStructuredModel()); // Use structured output model

    const prompt = createMultilingualPrompt('meeting-notes', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/action-items', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content, streaming = false } = req.body;
    const model = getVertexModel(getStructuredModel()); // Use structured output model

    const prompt = createMultilingualPrompt('action-items', content);

    if (streaming) {
      // Set up streaming response
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();

        // Increment usage after successful AI request
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      // Regular non-streaming response
      const result = await model.generateContent(prompt);
      const response = result.response;

      // Increment usage after successful AI request
      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AI TONE ENDPOINTS - 6 specialized tone transformations with unique approaches
// ============================================

// 1. Humorous Tone - Comedy writer specialist
app.post('/api/ai/tone/humorous', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Humorous tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Comedy writer transforming serious content into entertaining text.

Task: Add wit, wordplay, puns, funny observations, and comedic timing. Keep core message intact. Balance humor with respect.

Techniques: Clever jokes, playful analogies, relatable humor, funny asides, casual language, relevant emojis.

Rules:
- Respond in the SAME language as input
- Output ONLY the humorous version
- NO meta-commentary
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Humorous transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Humorous transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Humorous transformation failed' });
  }
});

// 2. Poetic Tone - Poet and literary artist
app.post('/api/ai/tone/poetic', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Poetic tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Poet and literary artist transforming ordinary text into beautiful, evocative prose.

Task: Create imagery, rhythm, and emotional resonance. Elevate mundane to art while preserving original meaning.

Techniques: Rich metaphors, sensory details, rhythmic flow, personification, evocative words.

Rules:
- Respond in the SAME language as input
- Output ONLY the poetic transformation
- NO meta-commentary
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Poetic transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Poetic transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Poetic transformation failed' });
  }
});

// 3. Dramatic Tone - Theatrical director and storyteller
app.post('/api/ai/tone/dramatic', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Dramatic tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Theatrical director amplifying intensity and emotional impact of every word.

Task: Build tension, create climactic moments, make every statement urgent. Turn volume to 11 - theatrical, gripping, impossible to ignore.

Techniques: Heightened language, emphatic punctuation!, tension building, strong emotions.

Rules:
- Respond in the SAME language as input
- Output ONLY the dramatic version
- NO setup or preamble
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Dramatic transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Dramatic transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Dramatic transformation failed' });
  }
});

// 4. Gen-Z Tone - Digital native and internet culture expert
app.post('/api/ai/tone/genz', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Gen-Z tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Gen-Z content creator speaking fluent internet language and viral culture.

Task: Transform to authentic, casual, self-aware style. Sound like texting your bestie - real, relatable, slightly chaotic.

Techniques: Current slang (lowkey, no cap, slay), internet abbreviations (ngl, tbh, iykyk), meme references, ironic tone, casual grammar, emojis.

Rules:
- Adapt Gen-Z style to input language (use local slang)
- Output ONLY the Gen-Z version
- NO explanations
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Gen-Z transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Gen-Z transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Gen-Z transformation failed' });
  }
});

// 5. Professional Tone - Executive communication consultant
app.post('/api/ai/tone/professional', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Professional tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Executive communication consultant transforming casual text into polished, business-appropriate language.

Task: Create clear, authoritative communication suitable for boardroom, official reports, or professional correspondence.

Principles: Formal vocabulary, complete sentences, objective tone, clear structure, industry terminology, active voice, NO emojis

Rules:
- Respond in the SAME language as input
- Output ONLY the professional version
- NO introductory remarks

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Professional transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Professional transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Professional transformation failed' });
  }
});

// 6. Simplify Tone - Educational content specialist
app.post('/api/ai/tone/simplify', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    console.log('Simplify tone transformation:', content.length, 'chars');

    const model = getVertexModel(getContentModel());

    const prompt = `Role: Educational content specialist making complex ideas accessible to everyone.

Task: Break down complexity into crystal-clear language. Target: someone with no background knowledge should understand easily.

Techniques: Short sentences, everyday vocabulary, simple alternatives, concrete examples, plain language, personal "you/your", NO emojis

Rules:
- Respond in the SAME language as input
- Output ONLY the simplified version
- NO preamble
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const aiResponse = getTextFromResponse(response);

    console.log('Simplify transformation completed:', aiResponse.length, 'chars');

    await incrementUserUsage(req.userEmail);
    res.json({ success: true, result: aiResponse.trim() });
  } catch (error) {
    console.error('Simplify transformation error:', error);
    res.status(500).json({ success: false, error: error.message || 'Simplify transformation failed' });
  }
});

// ============================================
// AI WORKSPACE ENDPOINTS - 5 specialized workspace features
// ============================================

// Helper function to validate workspace notes
const validateWorkspaceNotes = (notesContent) => {
  if (!notesContent || !Array.isArray(notesContent) || notesContent.length === 0) {
    return { valid: false, error: 'Notes content array is required and cannot be empty' };
  }
  return { valid: true };
};

// 1. Workspace Chat - Chat with context of multiple notes
app.post('/api/ai/workspace/chat', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { message, notesContent, streaming = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const validation = validateWorkspaceNotes(notesContent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log('Workspace chat:', message.substring(0, 50) + '...', 'Notes:', notesContent.length);

    const model = getVertexModel(getWorkspaceModel());

    // Combine all notes content
    const combinedContent = notesContent.join('\n\n--- NOTE SEPARATOR ---\n\n');

    const prompt = `Role: Knowledge integration specialist with cross-document analysis expertise.

Task: Analyze ${notesContent.length} notes simultaneously to answer user's question. Synthesize information, find connections, identify contradictions, cite sources.

Context (${notesContent.length} notes):
${combinedContent}

Question: ${message}

Rules:
- Respond in the SAME language as the question
- Output ONLY the answer with relevant context
- NO phrases like "Based on these notes..."
- Cite note numbers when relevant

Answer:`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail, true);
      } catch (streamError) {
        console.error('Workspace chat streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail, true);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Workspace chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Workspace chat failed'
    });
  }
});

// 2. Workspace Summary - Summarize multiple notes
app.post('/api/ai/workspace/summary', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { notesContent, streaming = false } = req.body;

    const validation = validateWorkspaceNotes(notesContent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log('Workspace summary for', notesContent.length, 'notes');

    const model = getVertexModel(getWorkspaceModel());

    const combinedContent = notesContent.join('\n\n--- NOTE SEPARATOR ---\n\n');

    const prompt = `Role: Executive briefing specialist creating high-level syntheses for decision-makers.

Task: Distill ${notesContent.length} notes into unified narrative. Find major themes, identify patterns, surface insights visible only when viewing all notes together. Lead with most critical information.

Rules:
- Respond in the SAME language as input
- Output ONLY the synthesis
- NO "Here's a summary..." or "These notes discuss..."
- Choose formatting that best serves the content

Content (${notesContent.length} notes):
${combinedContent}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail, true);
      } catch (streamError) {
        console.error('Workspace summary streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail, true);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Workspace summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Workspace summary failed'
    });
  }
});

// 3. Workspace Tasks - Extract all action items from multiple notes
app.post('/api/ai/workspace/tasks', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { notesContent, streaming = false } = req.body;

    const validation = validateWorkspaceNotes(notesContent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log('Workspace tasks extraction for', notesContent.length, 'notes');

    const model = getVertexModel(getWorkspaceModel());

    const combinedContent = notesContent.join('\n\n--- NOTE SEPARATOR ---\n\n');

    const prompt = `Role: Project manager extracting actionable work items from unstructured notes.

Task: Mine ${notesContent.length} notes for explicit and implicit action items. Deduplicate, prioritize by urgency/importance, add context (note source, deadlines, owners, dependencies).

Identification criteria: Explicit tasks ("Need to...", "Must..."), implicit tasks (problems requiring action), commitments, deadlines, dependencies

Rules:
- Respond in the SAME language as input
- Use markdown task lists: [ ] for unchecked items
- Output ONLY the task list
- NO introductory text
- Group**: Organize by theme/project if multiple areas exist
6. **Format**: Markdown checkboxes (- [ ]) with action verb start

Task format: - [ ] [Action verb] [what to do] [context: deadline/owner/source note if relevant]

CRITICAL: Start immediately with the first checkbox. NO "Here are the tasks...", "Task list:", or similar. Pure checklist only.

Extract from these ${notesContent.length} notes:
${combinedContent}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail, true);
      } catch (streamError) {
        console.error('Workspace tasks streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail, true);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Workspace tasks error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Workspace tasks extraction failed'
    });
  }
});

// 4. Workspace Keywords - Extract keywords from multiple notes
app.post('/api/ai/workspace/keywords', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { notesContent, streaming = false } = req.body;

    const validation = validateWorkspaceNotes(notesContent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    console.log('Workspace keywords extraction for', notesContent.length, 'notes');

    const model = getVertexModel(getWorkspaceModel());

    const combinedContent = notesContent.join('\n\n--- NOTE SEPARATOR ---\n\n');

    const prompt = `Role: Semantic analysis expert extracting conceptual DNA from multiple documents.

Task: Extract keywords/phrases from ${notesContent.length} notes. Mix single words and phrases. Order by importance. Identify frequency, semantic importance, themes, cross-document patterns.

Rules:
- Respond in the SAME language as input
- Output ONLY comma-separated keyword list
- NO labels like "Keywords:" or explanations
- Choose formatting that best serves the content

Content (${notesContent.length} notes):
${combinedContent}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail, true);
      } catch (streamError) {
        console.error('Workspace keywords streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail, true);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Workspace keywords error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Workspace keywords extraction failed'
    });
  }
});

// 5. Workspace Synthesize - Deep analysis with custom task
app.post('/api/ai/workspace/synthesize', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { notesContent, userTask, streaming = false } = req.body;

    const validation = validateWorkspaceNotes(notesContent);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }

    if (!userTask || typeof userTask !== 'string' || userTask.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'User task is required'
      });
    }

    console.log('Workspace synthesize:', userTask.substring(0, 50) + '...', 'Notes:', notesContent.length);

    const model = getVertexModel(getWorkspaceModel());

    const combinedContent = notesContent.join('\n\n--- NOTE SEPARATOR ---\n\n');

    const prompt = `Role: Strategic analyst finding non-obvious insights through specific analytical lenses.

Task: Analyze ${notesContent.length} notes through this lens: "${userTask}"

Framework: Interpret task, mine relevant information, detect patterns, map connections, analyze gaps, synthesize insights, provide actionable recommendations. Go beyond summarization - add analytical value.

Rules:
- Respond in the SAME language as the task
- Output ONLY the analysis
- NO "Based on my analysis..." or "Here's what I found..."
- Reference which notes when relevant
- Choose formatting that best serves the content

Task: ${userTask}

Content (${notesContent.length} notes):
${combinedContent}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail, true);
      } catch (streamError) {
        console.error('Workspace synthesize streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail, true);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Workspace synthesize error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Workspace synthesis failed'
    });
  }
});


// ============================================
// AI CHAT ENDPOINTS - 2 specialized chat modes
// ============================================

// System context about Quick Notes app
const QUICK_NOTES_CONTEXT = `You are an AI assistant integrated into Quick Notes - a Chrome extension for note-taking and knowledge management.

Quick Notes features: Rich text editing, collections, cloud sync, AI assistance, search, tags, backgrounds, markdown support.

Your capabilities: Help with writing, editing, organizing notes, content improvement, creative and professional writing.`;

// 1. Free Chat - General conversational AI
app.post('/api/ai/chat/free', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { message, streaming = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log('Free chat request:', message.substring(0, 50) + '...');

    const model = getVertexModel(getChatModel());

    const prompt = `Role: AI assistant in Quick Notes (Chrome extension for note-taking and knowledge management with rich text editing, collections, cloud sync, AI assistance, search, backgrounds).

Task: Help with writing, editing, organizing notes, content improvement, creative and professional writing.

Rules:
- Respond in the SAME language as the message
- Be conversational, helpful, friendly
- Output ONLY the helpful response
- NO unnecessary introductions like "Certainly!", "Of course!", "Sure, I can help!"
- Choose formatting that best serves the content

Message: ${message}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Free chat streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Free chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Context Chat - Chat with selected text/note content
app.post('/api/ai/chat/context', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { message, context, streaming = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    if (!context) {
      return res.status(400).json({
        success: false,
        error: 'Context is required for context chat'
      });
    }

    console.log('Context chat request:', message.substring(0, 50) + '...', 'Context length:', context.length);

    const model = getVertexModel(getChatModel());

    const prompt = `Role: AI assistant in Quick Notes helping with selected text from user's note.

Context:
${context}

Request: ${message}

Rules:
- Respond in the SAME language as the request
- Output ONLY the answer/content
- NO phrases like "Here is...", "Here's...", "I'll...", "Based on the text..."
- Be direct and actionable
- Choose formatting that best serves the content`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Context chat streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Context chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy chat endpoint for backward compatibility - redirects to new endpoints
app.post('/api/ai/chat', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { message, context, streaming = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log('[Legacy /api/ai/chat] Redirecting to new endpoints...');

    const model = getVertexModel(getChatModel());

    // Detect if this is context chat or free chat
    const hasContext = context && context.trim().length > 0;

    const prompt = hasContext
      ? `Role: AI assistant in Quick Notes helping with selected text.

Context:
${context}

Request: ${message}

Rules:
- Respond in the SAME language as request
- Output ONLY the answer
- NO phrases like "Here is...", "I'll...", "Based on the text..."
- Choose formatting that best serves the content`
      : `Role: AI assistant in Quick Notes.

Task: Help with writing, editing, organizing notes, content improvement.

Rules:
- Respond in the SAME language as message
- Be conversational, helpful, friendly
- Output ONLY the response
- NO "Certainly!", "Of course!", "Sure, I can help!"
- Choose formatting that best serves the content

Message: ${message}`;

    if (streaming) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        const result = await model.generateContentStream(prompt);

        for await (const chunk of result.stream) {
          const chunkText = getTextFromResponse(chunk);
          if (chunkText) {
            res.write(chunkText);
          }
        }

        res.end();
        await incrementUserUsage(req.userEmail);
      } catch (streamError) {
        console.error('Legacy chat streaming error:', streamError);
        res.status(500).end('Streaming error occurred');
      }
    } else {
      const result = await model.generateContent(prompt);
      const response = result.response;

      await incrementUserUsage(req.userEmail);

      res.json({ success: true, result: getTextFromResponse(response) });
    }
  } catch (error) {
    console.error('Legacy chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// OCR Text Extraction API Endpoint
app.post('/api/ai/analyze-image', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { imageData, analysisType, streaming } = req.body;
    const userEmail = req.userEmail;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'Image data is required'
      });
    }

    if (!analysisType) {
      return res.status(400).json({
        success: false,
        error: 'Analysis type is required'
      });
    }

    // Use the same usage checking system as other AI features
    // The checkUserAuthAndUsage middleware already handles this
    // No need for separate image analysis usage checking

    // Use vision-optimized model for OCR text extraction
    const model = getVertexModel(getVisionModel());

    if (analysisType !== 'extract-text') {
      return res.status(400).json({
        success: false,
        error: 'Only OCR text extraction is supported'
      });
    }

    const prompt = `Role: Expert OCR system extracting text from images with high accuracy.

Task: Extract ALL text - every word, number, symbol, character. Preserve structure, layout, formatting, punctuation. Maintain reading order (top to bottom, left to right).

Rules:
- Output ONLY the extracted text
- NO phrases like "Here is the text", "The image contains", "Extracted text:"
- Choose formatting that best serves the content

Extract:`;

    // Extract base64 data and MIME type
    const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
    const mimeType = imageData.includes(',') 
      ? imageData.split(',')[0].split(':')[1].split(';')[0] 
      : 'image/jpeg';

    // Process the image with Gemini using proper format
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          }
        ]
      }]
    });

    const response = result.response;
    let analysisResult = getTextFromResponse(response);

    // Clean up markdown formatting while preserving structure
    analysisResult = analysisResult
      // Remove markdown headers but keep the text
      .replace(/^#{1,6}\s+(.*)$/gm, '$1')
      // Remove bold/italic formatting but keep the text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Remove code formatting but keep the text
      .replace(/```([\s\S]*?)```/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      // Convert markdown lists to bullet points
      .replace(/^\*\s+(.*)$/gm, '• $1')
      .replace(/^-\s+(.*)$/gm, '• $1')
      .replace(/^\d+\.\s+(.*)$/gm, '• $1')
      // Remove blockquotes but keep the text
      .replace(/^>\s*(.*)$/gm, '$1')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, '')
      // Clean up excessive line breaks but keep structure
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    // Increment usage for regular users (same as other AI features)
    await incrementUserUsage(userEmail);

    // Check if streaming is requested
    if (streaming) {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Stream the text word by word
      const words = analysisResult.split(' ');
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.trim()) {
          const wordToSend = word + (i < words.length - 1 ? ' ' : '');
          res.write(wordToSend);

          // Add small delay for streaming effect
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      res.end();
    } else {
      // Regular response
      res.json({
        success: true,
        result: analysisResult,
        analysisType: analysisType
      });
    }

  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Image analysis failed'
    });
  }
});

// AI Color Suggestion - Smart color formatting for note content
app.post('/api/ai/color-suggestion', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const model = getVertexModel(getFormatModel()); // Use fast format model

    const prompt = `Role: Color design specialist adding colors to HTML for enhanced readability and visual appeal.

Task: Decide which elements in content should have color based on tone, context, emotion. Choose color harmony fitting content's mood. Use <span style="color: #HEXCODE">text</span>.

Rules:
- Output ONLY the HTML with colors applied
- Preserve all original HTML structure
- Keep emojis unchanged
- NO phrases like "Here is the colored content", "Formatted HTML:"
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let formattedContent = getTextFromResponse(response);

    // Clean up AI response - remove markdown code blocks and explanations
    formattedContent = formattedContent
      // Remove markdown code blocks
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/g, '')
      // Remove common AI explanations
      .replace(/^Here is the formatted content:?\s*/i, '')
      .replace(/^Here's the formatted content:?\s*/i, '')
      .replace(/^The formatted content:?\s*/i, '')
      .trim();

    // Only convert markdown to HTML if content doesn't already contain HTML tags
    if (!/<(span|div|p|h[1-6]|strong|em|ul|ol|li|blockquote|code|pre|a)\b[^>]*>/i.test(formattedContent)) {
      formattedContent = convertMarkdownToHTML(formattedContent);
    }

    // Increment usage after successful AI request
    await incrementUserUsage(req.userEmail);

    res.json({
      success: true,
      result: formattedContent
    });

  } catch (error) {
    console.error('Color suggestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Color suggestion failed'
    });
  }
});

// AI Structure Optimization - Optimize content structure and formatting
app.post('/api/ai/structure-optimization', checkUserAuthAndUsage, async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    const model = getVertexModel(getFormatModel()); // Use fast format model

    const prompt = `Role: Content structure specialist transforming unstructured content into well-organized HTML.

Task: Decide how content should be restructured. Make it scannable and professional.

Rules:
- Output ONLY the structured HTML
- Preserve all original text and emojis
- NO phrases like "Here's the structured content", "Optimized HTML:"
- Choose formatting that best serves the content

Content:
${content}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let optimizedContent = getTextFromResponse(response);

    // Clean up AI response - remove markdown code blocks and explanations
    optimizedContent = optimizedContent
      // Remove markdown code blocks
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/g, '')
      // Remove common AI explanations
      .replace(/^Here is the optimized content:?\s*/i, '')
      .replace(/^Here's the optimized content:?\s*/i, '')
      .replace(/^The optimized content:?\s*/i, '')
      .trim();

    // Only convert markdown to HTML if content doesn't already contain HTML tags
    if (!/<(span|div|p|h[1-6]|strong|em|ul|ol|li|blockquote|code|pre|a)\b[^>]*>/i.test(optimizedContent)) {
      optimizedContent = convertMarkdownToHTML(optimizedContent);
    }

    // Increment usage after successful AI request
    await incrementUserUsage(req.userEmail);

    res.json({
      success: true,
      result: optimizedContent
    });

  } catch (error) {
    console.error('Structure optimization error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Structure optimization failed'
    });
  }
});

// Generate Title from Note Content - Uses Gemini 2.0 Flash Lite (Free, no usage limit)
app.post('/api/ai/generate-title', async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    // Extract text from HTML content
    const tempDiv = new JSDOM(content).window.document.body;
    const textContent = tempDiv.textContent.trim();

    // If content is too short, use it as title
    if (textContent.length <= 50) {
      return res.json({
        success: true,
        title: textContent || 'Untitled Note'
      });
    }

    // Use lightweight model for title generation (fast and cost-effective)
    const model = getVertexModel(getTitleModel());

    const prompt = `Role: Expert title generator creating concise, descriptive titles.

Task: Generate title (max 60 chars) capturing main topic/theme/purpose. Be specific, informative, clear. No quotes, no punctuation at end, no generic titles.

Rules:
- Respond in the SAME language as content
- Output ONLY the title text
- NO phrases like "Title:", "The title is:", "Here's a title:"

Content:
${textContent.substring(0, 1000)}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    let title = getTextFromResponse(response).trim();

    // Clean up the title
    title = title
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/[.!?]+$/, '') // Remove ending punctuation
      .trim();

    // Ensure title is not too long
    if (title.length > 60) {
      title = title.substring(0, 57) + '...';
    }

    // Fallback if title is empty
    if (!title || title.length === 0) {
      title = textContent.substring(0, 50) || 'Untitled Note';
    }

    res.json({
      success: true,
      title: title
    });

  } catch (error) {
    console.error('Generate title error:', error);

    // Fallback: extract first line or first 50 chars
    try {
      const tempDiv = new JSDOM(req.body.content).window.document.body;
      const textContent = tempDiv.textContent.trim();
      const fallbackTitle = textContent.substring(0, 50) || 'Untitled Note';

      res.json({
        success: true,
        title: fallbackTitle
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        error: 'Failed to generate title',
        title: 'Untitled Note'
      });
    }
  }
});

// Debug endpoint to check environment variables
app.get('/debug/env', (req, res) => {
  res.json({
    hasWebhookSecret: !!LEMON_SQUEEZY_WEBHOOK_SECRET,
    hasApiKey: !!LEMON_SQUEEZY_API_KEY,
    hasStoreId: !!LEMON_SQUEEZY_STORE_ID,
    hasProductId: !!LEMON_SQUEEZY_PRODUCT_ID,
    hasVariantId: !!LEMON_SQUEEZY_VARIANT_ID,
    webhookSecretLength: LEMON_SQUEEZY_WEBHOOK_SECRET ? LEMON_SQUEEZY_WEBHOOK_SECRET.length : 0
  });
});

// Lemon Squeezy API Endpoints

// Check if user should be redirected to payment instead of trial
app.get('/api/payment/check-trial-eligibility/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const trialCheck = await checkTrialAbuse(userEmail);

    res.json({
      success: true,
      userEmail: userEmail,
      canUseTrial: trialCheck.canStartTrial,
      shouldRedirectToPayment: !trialCheck.canStartTrial,
      message: trialCheck.canStartTrial
        ? 'You are eligible for the free trial.'
        : (trialCheck.reason === 'recent_cancellation'
          ? 'You recently cancelled a trial. Please wait 24 hours before starting a new trial.'
          : trialCheck.reason === 'trial_already_used'
            ? 'You have already used the free trial. Please subscribe to continue using premium features.'
            : 'You have already used the free trial. Please subscribe to continue using premium features.'),
      trialCount: trialCheck.trialCount,
      maxTrials: trialCheck.maxTrials,
      reason: trialCheck.reason
    });
  } catch (error) {
    console.error('Error checking trial eligibility:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check trial eligibility'
    });
  }
});

// Create checkout session
app.post('/api/payment/create-checkout', async (req, res) => {
  try {
    console.log('🔄 Create checkout request received');
    console.log('📋 Request body:', req.body);

    const { productId, price, userEmail } = req.body;

    if (!userEmail) {
      console.error('❌ No user email provided');
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    // Check trial eligibility first
    const trialCheck = await checkTrialAbuse(userEmail);
    console.log('🔍 Trial check result:', trialCheck);

    console.log('🔑 Checking Lemon Squeezy configuration...');
    console.log('API Key exists:', !!LEMON_SQUEEZY_API_KEY);
    console.log('Store ID exists:', !!LEMON_SQUEEZY_STORE_ID);
    console.log('Variant ID exists:', !!LEMON_SQUEEZY_VARIANT_ID);

    if (!LEMON_SQUEEZY_API_KEY || !LEMON_SQUEEZY_STORE_ID || !LEMON_SQUEEZY_VARIANT_ID) {
      console.error('❌ Lemon Squeezy configuration missing');
      return res.status(500).json({
        success: false,
        error: 'Lemon Squeezy configuration missing'
      });
    }

    console.log('🌐 Creating Lemon Squeezy checkout...');

    // Determine checkout type based on trial eligibility
    let checkoutUrl;
    if (trialCheck.canStartTrial) {
      // User can use trial - create trial checkout
      console.log('🆓 Creating trial checkout for user:', userEmail);
      checkoutUrl = await createLemonSqueezyCheckout(userEmail, productId, price, true); // true = trial
    } else {
      // User has used trial - create paid checkout
      console.log('💰 Creating paid checkout for user:', userEmail);
      checkoutUrl = await createLemonSqueezyCheckout(userEmail, productId, price, false); // false = paid
    }

    console.log('✅ Checkout URL created:', checkoutUrl);

    res.json({
      success: true,
      checkoutUrl: checkoutUrl,
      isTrial: trialCheck.canStartTrial,
      trialCount: trialCheck.trialCount,
      maxTrials: trialCheck.maxTrials
    });
  } catch (error) {
    console.error('❌ Error creating checkout:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create checkout'
    });
  }
});


// Verify payment status with expiry check
app.get('/api/payment/verify/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();
    let isPremium = userData.isPremium || false;
    const premiumExpiry = userData.premiumExpiry || null;
    const subscriptionStatus = userData.subscriptionStatus || null;
    const paymentType = userData.paymentType || null;
    const paymentMethod = userData.paymentMethod || null;
    const nextRenewalDate = userData.nextRenewalDate || null;

    // Check if premium has expired
    if (isPremium && isPremiumExpired(premiumExpiry)) {
      // Reset user to free tier
      await userRef.update({
        isPremium: false,
        premiumExpiry: null,
        paymentMethod: null,
        orderId: null,
        paymentType: null
      });
      isPremium = false;
      console.log(`Premium expired for user: ${userEmail} (payment verification)`);
    }

    // Format dates for frontend
    let formattedExpiry = null;
    let formattedNextRenewal = null;

    if (premiumExpiry) {
      const expiryDate = premiumExpiry.toDate ? premiumExpiry.toDate() : new Date(premiumExpiry);
      formattedExpiry = expiryDate.toISOString();
    }

    if (nextRenewalDate) {
      const renewalDate = nextRenewalDate.toDate ? nextRenewalDate.toDate() : new Date(nextRenewalDate);
      formattedNextRenewal = renewalDate.toISOString();
    }

    res.json({
      success: true,
      isPremium: isPremium,
      premiumExpiry: formattedExpiry,
      subscriptionStatus: subscriptionStatus,
      paymentType: paymentType,
      paymentMethod: paymentMethod,
      nextRenewalDate: formattedNextRenewal,
      isExpired: isPremiumExpired(premiumExpiry)
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify payment'
    });
  }
});

// Admin endpoint to check payment status details
app.get('/api/admin/payment-status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      userData: userData,
      isPremium: userData.isPremium || false,
      isExpired: isPremiumExpired(userData.premiumExpiry),
      currentTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check payment status'
    });
  }
});

// Admin endpoint to manually revoke premium access (for testing/admin purposes)
app.post('/api/admin/revoke-premium', async (req, res) => {
  try {
    const { userEmail, reason } = req.body;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const userRef = db.collection('users').doc(userEmail);
    await userRef.update({
      isPremium: false,
      premiumExpiry: null,
      paymentMethod: null,
      orderId: null,
      paymentType: null,
      subscriptionStatus: 'manually_revoked',
      revocationDate: admin.firestore.FieldValue.serverTimestamp(),
      revocationReason: reason || 'manual_revocation',
      hasEverBeenPremium: true // Keep this flag even after revocation
    });

    console.log(`🔧 Manual premium revocation for user: ${userEmail}, reason: ${reason || 'manual_revocation'}`);
    res.json({
      success: true,
      message: `Premium access revoked for ${userEmail}`
    });
  } catch (error) {
    console.error('Error revoking premium access:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to revoke premium access'
    });
  }
});

// Admin endpoint to mark user as having been premium before (for existing users)
app.post('/api/admin/mark-premium-history', async (req, res) => {
  try {
    const { userEmail, reason } = req.body;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    await userRef.update({
      hasEverBeenPremium: true,
      premiumHistoryMarked: true,
      historyMarkedDate: admin.firestore.FieldValue.serverTimestamp(),
      historyMarkedReason: reason || 'admin_marked'
    });

    console.log(`🔧 Marked premium history for user: ${userEmail}, reason: ${reason || 'admin_marked'}`);
    res.json({
      success: true,
      message: `Premium history marked for ${userEmail}`
    });
  } catch (error) {
    console.error('Error marking premium history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to mark premium history'
    });
  }
});

// Admin endpoint to get refund policy status
app.get('/api/admin/refund-policy', async (req, res) => {
  res.json({
    success: true,
    refundPolicy: {
      enabled: false,
      policy: 'NO_REFUND',
      description: 'All sales are final. No refunds will be processed.',
      exceptions: [],
      contact: 'support@quicknotes.com'
    }
  });
});

// Admin endpoint to check trial abuse status for a user
app.get('/api/admin/trial-status/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email required'
      });
    }

    const trialCheck = await checkTrialAbuse(userEmail);
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userData = userDoc.data();

    res.json({
      success: true,
      userEmail: userEmail,
      trialStatus: {
        canStartTrial: trialCheck.canStartTrial,
        trialCount: trialCheck.trialCount,
        maxTrials: trialCheck.maxTrials,
        lastTrialStartDate: userData.lastTrialStartDate || null,
        abuseDetected: userData.abuseDetected || false,
        abuseReason: userData.abuseReason || null
      },
      userData: {
        isPremium: userData.isPremium || false,
        subscriptionStatus: userData.subscriptionStatus || null,
        paymentType: userData.paymentType || null,
        premiumExpiry: userData.premiumExpiry || null
      }
    });
  } catch (error) {
    console.error('Error checking trial status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check trial status'
    });
  }
});

// Test endpoint to check Lemon Squeezy configuration
app.get('/api/admin/test-lemon-squeezy', async (req, res) => {
  try {
    const config = {
      apiKey: LEMON_SQUEEZY_API_KEY ? `${LEMON_SQUEEZY_API_KEY.substring(0, 10)}...` : 'NOT_SET',
      storeId: LEMON_SQUEEZY_STORE_ID || 'NOT_SET',
      productId: LEMON_SQUEEZY_PRODUCT_ID || 'NOT_SET',
      trialProductId: LEMON_SQUEEZY_TRIAL_PRODUCT_ID || 'NOT_SET',
      variantId: LEMON_SQUEEZY_VARIANT_ID || 'NOT_SET',
      trialVariantId: LEMON_SQUEEZY_TRIAL_VARIANT_ID || 'NOT_SET',
      webhookSecret: LEMON_SQUEEZY_WEBHOOK_SECRET ? `${LEMON_SQUEEZY_WEBHOOK_SECRET.substring(0, 5)}...` : 'NOT_SET'
    };

    console.log('🔍 Lemon Squeezy Configuration Test:', config);

    // Test API call to Lemon Squeezy
    try {
      const testResponse = await axios.get(`https://api.lemonsqueezy.com/v1/stores/${LEMON_SQUEEZY_STORE_ID}`, {
        headers: {
          'Authorization': `Bearer ${LEMON_SQUEEZY_API_KEY}`,
          'Accept': 'application/vnd.api+json'
        },
        timeout: 10000
      });

      res.json({
        success: true,
        config: config,
        storeTest: {
          success: true,
          status: testResponse.status,
          storeName: testResponse.data?.data?.attributes?.name || 'Unknown'
        }
      });
    } catch (apiError) {
      res.json({
        success: false,
        config: config,
        storeTest: {
          success: false,
          error: apiError.message,
          status: apiError.response?.status,
          data: apiError.response?.data
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint to create checkout directly
app.post('/api/admin/test-checkout', async (req, res) => {
  try {
    const { userEmail = 'test@example.com' } = req.body;

    console.log('🧪 Testing checkout creation...');

    const checkoutUrl = await createLemonSqueezyCheckout(userEmail, 'monthly-premium', 3.99);

    res.json({
      success: true,
      checkoutUrl: checkoutUrl,
      message: 'Checkout created successfully'
    });
  } catch (error) {
    console.error('❌ Test checkout failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

// --- SUPPORT SYSTEM ---

// Configure nodemailer - Lazy load to avoid startup issues
function createEmailTransporter() {
  const sender = process.env.SUPPORT_EMAIL_SENDER || 'alvesoscar517@gmail.com';
  const password = process.env.SUPPORT_EMAIL_PASSWORD;
  
  if (!password) {
    const error = new Error('SUPPORT_EMAIL_PASSWORD environment variable is not set. Email sending is disabled.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  }
  
  // Lazy load nodemailer only when needed
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: sender,
      pass: password
    }
  });
}

// Generate support token (called from extension)
app.post('/api/support/generate-token', async (req, res) => {
  try {
    const userEmail = req.headers['x-user-email'];
    
    if (!userEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    // Verify user is premium
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || !userDoc.data().isPremium || isPremiumExpired(userDoc.data().premiumExpiry)) {
      return res.status(403).json({ error: 'Premium access required' });
    }

    // Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token in Firestore with 10 minute expiry
    const tokenRef = db.collection('supportTokens').doc(token);
    await tokenRef.set({
      email: userEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)) // 10 minutes
    });

    res.json({ token });
  } catch (error) {
    console.error('Error generating support token:', error);
    res.status(500).json({ error: 'Failed to generate support token' });
  }
});

// Serve support page
app.get('/support', async (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Access - Quick Notes</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #ffffff;
            }
            .message {
              background: white;
              padding: 40px;
              border-radius: 16px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              border: 1px solid #e5e7eb;
            }
            h1 { color: #1a202c; margin-bottom: 16px; }
            p { color: #718096; }
          </style>
        </head>
        <body>
          <div class="message">
            <h1>❌ Invalid Access</h1>
            <p>Support page requires a valid access token.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Verify token
    const tokenRef = db.collection('supportTokens').doc(token);
    const tokenDoc = await tokenRef.get();
    
    if (!tokenDoc.exists) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Token - Quick Notes</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #ffffff;
            }
            .message {
              background: white;
              padding: 40px;
              border-radius: 16px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              border: 1px solid #e5e7eb;
            }
            h1 { color: #1a202c; margin-bottom: 16px; }
            p { color: #718096; }
          </style>
        </head>
        <body>
          <div class="message">
            <h1>❌ Invalid Token</h1>
            <p>This support link is invalid or has expired.</p>
          </div>
        </body>
        </html>
      `);
    }

    const tokenData = tokenDoc.data();
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();
    
    // Check if token has expired
    if (now > expiresAt) {
      // Delete expired token
      await tokenRef.delete();
      
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Token Expired - Quick Notes</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: #ffffff;
            }
            .message {
              background: white;
              padding: 40px;
              border-radius: 16px;
              text-align: center;
              max-width: 400px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
              border: 1px solid #e5e7eb;
            }
            h1 { color: #1a202c; margin-bottom: 16px; }
            p { color: #718096; }
          </style>
        </head>
        <body>
          <div class="message">
            <h1>⏰ Token Expired</h1>
            <p>This support link has expired. Please generate a new one from the extension.</p>
          </div>
        </body>
        </html>
      `);
    }

    const userEmail = tokenData.email;
    
    // Verify user is still premium
    const userRef = db.collection('users').doc(userEmail);
    const userDoc = await userRef.get();
    
    // Verify user is premium
    if (userEmail) {
      const userRef = db.collection('users').doc(userEmail);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists || !userDoc.data().isPremium || isPremiumExpired(userDoc.data().premiumExpiry)) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Premium Only - Quick Notes</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background: #ffffff;
              }
              .message {
                background: white;
                padding: 40px;
                border-radius: 16px;
                text-align: center;
                max-width: 400px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                border: 1px solid #e5e7eb;
              }
              h1 { color: #1a202c; margin-bottom: 16px; }
              p { color: #718096; }
            </style>
          </head>
          <body>
            <div class="message">
              <h1>🔒 Premium Feature</h1>
              <p>Support access is only available for Premium users.</p>
            </div>
          </body>
          </html>
        `);
      }
    }
    
    // Serve support page - INLINE HTML (same as share note page)
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Premium Support - Quick Notes</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #ffffff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 16px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            animation: slideUp 0.4s ease-out;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header-icon {
            width: 64px;
            height: 64px;
            background: rgba(255, 215, 0, 0.15);
            border: 2px solid rgba(255, 215, 0, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
        }

        .header-icon svg {
            width: 32px;
            height: 32px;
            color: #d4af37;
        }

        h1 {
            font-size: 28px;
            color: #1a202c;
            margin-bottom: 8px;
        }

        .subtitle {
            color: #718096;
            font-size: 14px;
        }

        .form-group {
            margin-bottom: 24px;
        }

        label {
            display: block;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 8px;
            font-size: 14px;
        }

        input[type="email"],
        input[type="text"],
        textarea {
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 14px;
            transition: all 0.2s;
            font-family: inherit;
        }

        input[type="email"]:focus,
        input[type="text"]:focus,
        textarea:focus {
            outline: none;
            border-color: #d4af37;
            box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
        }

        textarea {
            resize: vertical;
            min-height: 120px;
        }

        .submit-btn {
            width: 100%;
            padding: 14px;
            background: #d4af37;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .submit-btn:hover:not(:disabled) {
            background: #c19b2e;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
        }

        .submit-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .success-message,
        .error-message {
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
            animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .success-message {
            background: #c6f6d5;
            color: #22543d;
            border: 1px solid #9ae6b4;
        }

        .error-message {
            background: #fed7d7;
            color: #742a2a;
            border: 1px solid #fc8181;
        }

        .char-count {
            text-align: right;
            font-size: 12px;
            color: #a0aec0;
            margin-top: 4px;
        }

        @media (max-width: 640px) {
            .container {
                padding: 24px;
            }

            h1 {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                </svg>
            </div>
            <h1>Premium Support</h1>
            <p class="subtitle">We're here to help! Send us your question or issue.</p>
        </div>

        <div id="successMessage" class="success-message">
            ✓ Your message has been sent successfully! We'll get back to you soon.
        </div>

        <div id="errorMessage" class="error-message">
            ✗ <span id="errorText">Something went wrong. Please try again.</span>
        </div>

        <form id="supportForm">
            <div class="form-group">
                <label for="email">Your Email *</label>
                <input type="email" id="email" name="email" required placeholder="your@email.com">
            </div>

            <div class="form-group">
                <label for="subject">Subject *</label>
                <input type="text" id="subject" name="subject" required placeholder="Brief description of your issue" maxlength="100">
            </div>

            <div class="form-group">
                <label for="message">Message *</label>
                <textarea id="message" name="message" required placeholder="Please describe your issue in detail..." maxlength="2000"></textarea>
                <div class="char-count"><span id="charCount">0</span>/2000</div>
            </div>

            <button type="submit" class="submit-btn" id="submitBtn">
                Send Message
            </button>
        </form>
    </div>

    <script>
        const form = document.getElementById('supportForm');
        const submitBtn = document.getElementById('submitBtn');
        const successMessage = document.getElementById('successMessage');
        const errorMessage = document.getElementById('errorMessage');
        const errorText = document.getElementById('errorText');
        const messageTextarea = document.getElementById('message');
        const charCount = document.getElementById('charCount');

        // Character counter
        messageTextarea.addEventListener('input', () => {
            charCount.textContent = messageTextarea.value.length;
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Disable submit button
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            // Hide previous messages
            successMessage.style.display = 'none';
            errorMessage.style.display = 'none';

            try {
                const response = await fetch('/api/support/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: document.getElementById('email').value,
                        subject: document.getElementById('subject').value,
                        message: document.getElementById('message').value
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    showSuccess();
                    form.reset();
                    charCount.textContent = '0';
                } else {
                    showError(result.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Error:', error);
                showError('Network error. Please check your connection and try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
            }
        });

        function showSuccess() {
            successMessage.style.display = 'block';
            setTimeout(() => {
                successMessage.style.display = 'none';
            }, 5000);
        }

        function showError(message) {
            errorText.textContent = message;
            errorMessage.style.display = 'block';
            setTimeout(() => {
                errorMessage.style.display = 'none';
            }, 5000);
        }
    </script>
</body>
</html>
    `);
  } catch (error) {
    console.error('Error serving support page:', error);
    res.status(500).send('Error loading support page');
  }
});

// Handle support form submission
app.post('/api/support/send', async (req, res) => {
  try {
    const { email, subject, message } = req.body;

    // Validate required fields
    if (!email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify user is premium
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists || !userDoc.data().isPremium || isPremiumExpired(userDoc.data().premiumExpiry)) {
      return res.status(403).json({ error: 'Support access is only available for Premium users' });
    }

    // Send email
    const mailOptions = {
      from: process.env.SUPPORT_EMAIL_SENDER || 'alvesoscar517@gmail.com',
      to: process.env.SUPPORT_EMAIL_RECEIVER || 'quicknotes.care@gmail.com',
      replyTo: email,
      subject: `[Quick Notes Support] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #d4af37; padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Quick Notes Support Request</h2>
          </div>
          <div style="background: #f7fafc; padding: 20px; border-radius: 0 0 8px 8px;">
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px;">
              <p style="margin: 0 0 8px 0;"><strong>From:</strong> ${email}</p>
              <p style="margin: 0 0 8px 0;"><strong>Subject:</strong> ${subject}</p>
              <p style="margin: 0;"><strong>Premium User:</strong> ✓ Yes</p>
            </div>
            <div style="background: white; padding: 20px; border-radius: 8px;">
              <h3 style="margin-top: 0;">Message:</h3>
              <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
            </div>
          </div>
        </div>
      `
    };

    // Log support request in Firestore first (even if email fails)
    const supportRequestRef = await db.collection('support_requests').add({
      userEmail: email,
      subject: subject,
      message: message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      emailSent: false
    });

    // Try to send email
    let emailSent = false;
    let emailError = null;
    
    try {
      const transporter = createEmailTransporter();
      await transporter.sendMail(mailOptions);
      emailSent = true;
      console.log(`✅ Support email sent successfully from ${email}`);
      
      // Update Firestore to mark email as sent
      await supportRequestRef.update({
        emailSent: true,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      emailError = error;
      console.error('⚠️ Failed to send support email:', error.message);
      
      // Update Firestore with error details
      await supportRequestRef.update({
        emailSent: false,
        emailError: error.message,
        emailErrorCode: error.code || 'UNKNOWN'
      });
      
      // If email is not configured, return specific error
      if (error.code === 'EMAIL_NOT_CONFIGURED') {
        return res.status(503).json({ 
          error: 'Email service is temporarily unavailable. Your request has been saved and we will respond as soon as possible.',
          requestId: supportRequestRef.id,
          saved: true
        });
      }
    }

    // Return success with email status
    res.json({ 
      success: true, 
      message: emailSent 
        ? 'Support request sent successfully via email' 
        : 'Support request saved. We will respond as soon as possible.',
      emailSent: emailSent,
      requestId: supportRequestRef.id
    });
  } catch (error) {
    console.error('❌ Error processing support request:', error);
    res.status(500).json({ error: 'Failed to send support request. Please try again.' });
  }
});

// Start server for Cloud Run
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});