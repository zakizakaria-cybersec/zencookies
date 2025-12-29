export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
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
    const invoice = await createAkauntingInvoice(items, customer);

    return new Response(JSON.stringify({ success: true, invoice }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Helper function to interact with Akaunting API
async function createAkauntingInvoice(items: any[], customerData?: { name: string, phone: string }) {
  const AKAUNTING_URL = import.meta.env.AKAUNTING_URL; 
  const AKAUNTING_TOKEN = import.meta.env.AKAUNTING_TOKEN;
  const COMPANY_ID = import.meta.env.AKAUNTING_COMPANY_ID;

  if (!AKAUNTING_URL || !AKAUNTING_TOKEN) {
    throw new Error('Missing Akaunting configuration');
  }

  // 1. Find or Create Customer
  let customerId = import.meta.env.DEFAULT_CUSTOMER_ID;
  
  if (customerData && customerData.name) {
      try {
          customerId = await findOrCreateCustomer(customerData, AKAUNTING_URL, AKAUNTING_TOKEN, COMPANY_ID);
      } catch (e) {
          console.error('Failed to find/create customer, using default:', e);
      }
  }

  // 2. Map items
  const invoiceItems = items.map(item => ({
    name: item.name,
    quantity: item.quantity,
    price: item.price, // This is unit price
    total: item.price * item.quantity
  }));

  const payload: any = {
    company_id: COMPANY_ID,
    customer_id: customerId,
    items: invoiceItems,
    type: 'invoice',
    invoiced_at: new Date().toISOString().split('T')[0],
    due_at: new Date().toISOString().split('T')[0],
    category_id: 1, 
    // Add a note to indicate this is from WhatsApp
    notes: `Order via WhatsApp Web. Customer Phone: ${customerData?.phone || 'N/A'}`,
    // Status: draft (if supported by API directly, otherwise it defaults to draft usually)
    status: 'draft' 
  };

  const response = await fetch(`${AKAUNTING_URL}/invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AKAUNTING_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Akaunting API Error: ${errorText}`);
  }

  return await response.json();
}

async function findOrCreateCustomer(
    customer: { name: string, phone: string }, 
    baseUrl: string, 
    token: string,
    companyId: string
) {
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    // 1. Search for existing customer by email (if we had it) or name
    // Akaunting search is basic. Let's try to search by name.
    // Ideally we search by phone but standard Akaunting might not index phone for search easily via API query param
    // We'll try to search by name first.
    const searchRes = await fetch(`${baseUrl}/customers?search=name:${customer.name}&limit=1`, { headers });
    if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.data && data.data.length > 0) {
            return data.data[0].id;
        }
    }

    // 2. Create new customer
    const createPayload = {
        company_id: companyId,
        name: customer.name,
        phone: customer.phone,
        currency_code: 'MYR', // Default currency
        enabled: 1
    };

    const createRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(createPayload)
    });

    if (createRes.ok) {
        const newCustomer = await createRes.json();
        return newCustomer.data.id;
    }

    throw new Error('Failed to create customer');
}
