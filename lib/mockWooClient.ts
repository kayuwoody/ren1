// Mock WooCommerce API Client for Development
// Use this when the live API is blocked or unavailable

export const mockWcApi = {
  async get(endpoint: string, params?: any) {
    console.log('🔧 MOCK API: GET', endpoint, params);

    // Mock products
    if (endpoint === 'products') {
      return {
        data: [
          {
            id: 1,
            name: 'Latte',
            price: '12.50',
            images: [{ src: 'https://via.placeholder.com/300x200?text=Latte' }],
            description: 'Smooth espresso with steamed milk'
          },
          {
            id: 2,
            name: 'Cappuccino',
            price: '11.00',
            images: [{ src: 'https://via.placeholder.com/300x200?text=Cappuccino' }],
            description: 'Rich espresso with foam'
          },
          {
            id: 3,
            name: 'Americano',
            price: '9.50',
            images: [{ src: 'https://via.placeholder.com/300x200?text=Americano' }],
            description: 'Espresso with hot water'
          },
          {
            id: 4,
            name: 'Mocha',
            price: '13.00',
            images: [{ src: 'https://via.placeholder.com/300x200?text=Mocha' }],
            description: 'Chocolate espresso delight'
          }
        ]
      };
    }

    // Mock customers
    if (endpoint === 'customers') {
      const email = params?.email || 'test@example.com';
      return {
        data: [
          {
            id: 123,
            email: email,
            first_name: 'Test',
            last_name: 'User',
            username: email,
            billing: { email },
            shipping: { email }
          }
        ]
      };
    }

    // Mock orders list
    if (endpoint === 'orders') {
      return {
        data: []
      };
    }

    // Mock single order
    if (endpoint.startsWith('orders/')) {
      const orderId = endpoint.split('/')[1];
      return {
        data: {
          id: parseInt(orderId),
          status: 'processing',
          total: '25.50',
          line_items: [
            { id: 1, name: 'Latte', quantity: 2, total: '25.00' }
          ],
          meta_data: [
            { key: 'startTime', value: String(Date.now()) },
            { key: 'endTime', value: String(Date.now() + 240000) }
          ]
        }
      };
    }

    return { data: [] };
  },

  async post(endpoint: string, payload: any) {
    console.log('🔧 MOCK API: POST', endpoint, payload);

    // Mock customer creation
    if (endpoint === 'customers') {
      return {
        data: {
          id: Math.floor(Math.random() * 1000),
          email: payload.email,
          username: payload.email,
          billing: payload.billing || {},
          shipping: payload.shipping || {}
        }
      };
    }

    // Mock order creation
    if (endpoint === 'orders') {
      return {
        data: {
          id: Math.floor(Math.random() * 10000),
          status: 'pending',
          total: '0.00',
          line_items: payload.line_items || [],
          meta_data: payload.meta_data || [],
          date_created: new Date().toISOString()
        }
      };
    }

    return { data: {} };
  },

  async put(endpoint: string, payload: any) {
    console.log('🔧 MOCK API: PUT', endpoint, payload);

    // Mock order update
    if (endpoint.startsWith('orders/')) {
      const orderId = endpoint.split('/')[1];
      return {
        data: {
          id: parseInt(orderId),
          status: payload.status || 'processing',
          meta_data: payload.meta_data || [],
          line_items: []
        }
      };
    }

    return { data: {} };
  }
};
