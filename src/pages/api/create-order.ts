export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Handle sendBeacon (text/plain) or fetch (application/json)
    let data;
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
        data = await request.json();
    } else {
        // sendBeacon sends as text/plain usually, but we sent a Blob with type application/json
        // Astro might parse it if the type is correct. If not, we parse text.
        // If we used Blob with type application/json, Astro should handle it.
        // But just in case it comes as text:
        const text = await request.text();
        try {
            data = JSON.parse(text);
        } catch (e) {
            // If parsing fails, maybe it's empty or wrong format
            return new Response('Invalid JSON', { status: 400 });
        }
    }

    const { items, customer } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid order data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send to Akaunting
    const invoice = await createAkauntingInvoice(items, customer, locals);

    return new Response(JSON.stringify({ success: true, invoice }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal Server Error', 
      message: error?.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Helper function to interact with Akaunting API
async function createAkauntingInvoice(items: any[], customerData: { name: string, phone: string } | undefined, locals: any) {
  // Try to get env from Cloudflare context first, then fallback to import.meta.env (for local dev)
  const runtimeEnv = locals?.runtime?.env;
  const env = runtimeEnv || import.meta.env;
  
  // Akaunting configuration - base URL should be the domain without /api
  let AKAUNTING_URL = env.AKAUNTING_URL ? env.AKAUNTING_URL.replace(/\/+$/, '') : '';
  const AKAUNTING_EMAIL = env.AKAUNTING_EMAIL;
  const AKAUNTING_PASSWORD = env.AKAUNTING_PASSWORD;
  const AKAUNTING_API_KEY = env.AKAUNTING_API_KEY;
  const COMPANY_ID = env.AKAUNTING_COMPANY_ID || '1';
  const DEFAULT_CONTACT_ID = env.DEFAULT_CUSTOMER_ID;

  // Remove /api/v1 if present - we'll add it ourselves
  AKAUNTING_URL = AKAUNTING_URL.replace(/\/api(\/v\d+)?$/, '');

  // Debug logging
  console.log('Akaunting Configuration:', {
    Source: runtimeEnv ? 'Cloudflare Locals' : 'import.meta.env',
    BaseUrl: AKAUNTING_URL,
    HasEmail: !!AKAUNTING_EMAIL,
    HasPassword: !!AKAUNTING_PASSWORD,
    HasApiKey: !!AKAUNTING_API_KEY,
    CompanyId: COMPANY_ID,
    DefaultContactId: DEFAULT_CONTACT_ID
  });

  if (!AKAUNTING_URL || !AKAUNTING_EMAIL || !AKAUNTING_PASSWORD) {
    const missing = [];
    if (!AKAUNTING_URL) missing.push('AKAUNTING_URL');
    if (!AKAUNTING_EMAIL) missing.push('AKAUNTING_EMAIL');
    if (!AKAUNTING_PASSWORD) missing.push('AKAUNTING_PASSWORD');
    console.error('Missing configuration variables:', missing);
    throw new Error(`Missing Akaunting configuration: ${missing.join(', ')}`);
  }

  // Use Basic Auth (email:password base64 encoded) + API Key header
  const basicAuth = Buffer.from(`${AKAUNTING_EMAIL}:${AKAUNTING_PASSWORD}`).toString('base64');
  
  const headers: Record<string, string> = {
    'Authorization': `Basic ${basicAuth}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Company': COMPANY_ID
  };
  
  // Add API key if available
  if (AKAUNTING_API_KEY) {
    headers['X-Api-Key'] = AKAUNTING_API_KEY;
  }

  // API base URL
  const apiBaseUrl = `${AKAUNTING_URL}/api`;

  // 1. Find or Create Contact (Customer)
  let contactId = DEFAULT_CONTACT_ID;
  
  if (customerData && customerData.name) {
    try {
      console.log('Attempting to find/create customer:', customerData.name);
      contactId = await findOrCreateContact(customerData, apiBaseUrl, headers, COMPANY_ID);
      console.log('Contact ID resolved:', contactId);
    } catch (e: any) {
      console.error('Failed to find/create customer, using default:', e?.message);
      if (!DEFAULT_CONTACT_ID) {
        throw new Error('Failed to create customer and no default customer ID configured');
      }
    }
  }

  if (!contactId) {
    console.error('No Contact ID available');
    throw new Error('Contact ID is required to create an invoice');
  }

  // 2. Prepare invoice items with required fields
  const invoiceItems = items.map((item, index) => ({
    name: item.name,
    description: item.description || item.name,
    quantity: item.quantity || 1,
    price: item.price,
    // item_id: item.id, // Optional: if you have items in Akaunting
  }));

  // 3. Create the invoice using /api/documents endpoint
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate due date (e.g., 30 days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const invoicePayload = {
    type: 'invoice',
    document_number: `INV-${Date.now()}`, // Auto-generate invoice number
    status: 'draft',
    issued_at: today,
    due_at: dueDateStr,
    contact_id: parseInt(contactId),
    contact_name: customerData?.name || 'Walk-in Customer',
    currency_code: 'MYR',
    category_id: 1, // Default income category, adjust as needed
    items: invoiceItems,
    notes: `Order via WhatsApp Web.\nCustomer: ${customerData?.name || 'N/A'}\nPhone: ${customerData?.phone || 'N/A'}`,
  };

  console.log('Creating invoice with payload:', JSON.stringify(invoicePayload, null, 2));
  
  const invoiceUrl = `${apiBaseUrl}/documents?company_id=${COMPANY_ID}`;
  console.log('Invoice URL:', invoiceUrl);

  const response = await fetch(invoiceUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(invoicePayload)
  });

  const responseText = await response.text();
  console.log('Akaunting Response Status:', response.status);
  console.log('Akaunting Response Body:', responseText);

  if (!response.ok) {
    // Parse error details if possible
    let errorDetails = responseText;
    try {
      const errorJson = JSON.parse(responseText);
      if (errorJson.message) {
        errorDetails = errorJson.message;
      }
      if (errorJson.errors) {
        errorDetails += ' - ' + JSON.stringify(errorJson.errors);
      }
    } catch {}
    
    throw new Error(`Akaunting API Error (${response.status}): ${errorDetails}`);
  }

  let invoiceData;
  try {
    invoiceData = JSON.parse(responseText);
  } catch {
    return { success: true, raw: responseText };
  }

  // 4. Record payment to mark invoice as paid and create income transaction
  const invoiceId = invoiceData.data?.id;
  if (invoiceId) {
    try {
      console.log('Recording payment for invoice:', invoiceId);
      await recordPayment(invoiceId, invoiceItems, apiBaseUrl, headers, COMPANY_ID, env);
      console.log('Payment recorded successfully');
    } catch (e: any) {
      console.error('Failed to record payment (invoice still created):', e?.message);
      // Don't throw - invoice was created successfully, payment recording is optional
    }
  }

  return invoiceData;
}

// Record payment for an invoice - this marks it as paid and creates an income transaction
async function recordPayment(
  invoiceId: number,
  items: any[],
  apiBaseUrl: string,
  headers: Record<string, string>,
  companyId: string,
  env: any
): Promise<void> {
  // Calculate total amount
  const totalAmount = items.reduce((sum, item) => {
    return sum + (item.price * (item.quantity || 1));
  }, 0);

  const today = new Date().toISOString().split('T')[0];
  
  // Default account ID (usually 1 for default cash/bank account)
  const accountId = env.AKAUNTING_ACCOUNT_ID || '1';

  const paymentPayload = {
    paid_at: today,
    amount: totalAmount,
    account_id: parseInt(accountId),
    currency_code: 'MYR',
    currency_rate: 1,
    description: 'Payment received via WhatsApp order',
    payment_method: 'cash', // or 'online', 'bank_transfer', etc.
    reference: `PAY-${Date.now()}`,
  };

  console.log('Recording payment with payload:', JSON.stringify(paymentPayload, null, 2));

  // Use the document transactions endpoint to add payment
  const paymentUrl = `${apiBaseUrl}/documents/${invoiceId}/transactions?company_id=${companyId}`;
  console.log('Payment URL:', paymentUrl);

  const response = await fetch(paymentUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(paymentPayload)
  });

  const responseText = await response.text();
  console.log('Payment Response Status:', response.status);
  console.log('Payment Response Body:', responseText);

  if (!response.ok) {
    throw new Error(`Payment API Error (${response.status}): ${responseText}`);
  }
}

async function findOrCreateContact(
  customer: { name: string; phone: string },
  apiBaseUrl: string,
  headers: Record<string, string>,
  companyId: string
): Promise<string> {
  // 1. Search for existing contact by name or phone
  const searchUrl = `${apiBaseUrl}/contacts?company_id=${companyId}&search=name:${encodeURIComponent(customer.name)}&type=customer&limit=1`;
  console.log('Searching for contact:', searchUrl);
  
  const searchRes = await fetch(searchUrl, { 
    method: 'GET',
    headers 
  });
  
  if (searchRes.ok) {
    const data = await searchRes.json();
    console.log('Contact search result:', JSON.stringify(data, null, 2));
    if (data.data && data.data.length > 0) {
      return data.data[0].id.toString();
    }
  } else {
    console.error('Contact search failed:', searchRes.status, await searchRes.text());
  }

  // 2. Create new contact if not found
  console.log('Creating new contact:', customer.name);
  
  const createPayload = {
    type: 'customer',
    name: customer.name,
    phone: customer.phone || '',
    currency_code: 'MYR',
    enabled: 1,
  };

  const createUrl = `${apiBaseUrl}/contacts?company_id=${companyId}`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(createPayload)
  });

  const createResponseText = await createRes.text();
  console.log('Create contact response:', createRes.status, createResponseText);

  if (createRes.ok) {
    try {
      const newContact = JSON.parse(createResponseText);
      if (newContact.data && newContact.data.id) {
        return newContact.data.id.toString();
      }
    } catch {}
  }

  throw new Error(`Failed to create contact: ${createResponseText}`);
}
