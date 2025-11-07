import { NextResponse } from 'next/server';

/**
 * Error types for better categorization
 */
export enum ErrorType {
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  UNAUTHORIZED = 'unauthorized',
  WOOCOMMERCE = 'woocommerce',
  DATABASE = 'database',
  INTERNAL = 'internal',
}

/**
 * Error response structure
 */
interface ErrorResponse {
  error: string;
  detail?: string;
  type?: ErrorType;
  timestamp?: string;
}

/**
 * Standardized API error handler
 *
 * Handles errors consistently across all routes with:
 * - Proper logging with context
 * - WooCommerce API error extraction
 * - Consistent response format
 * - Appropriate status codes
 *
 * @param error - The caught error object
 * @param context - Route context for logging (e.g., '/api/orders/[orderId]', 'create order')
 * @param type - Optional error type for categorization
 * @returns NextResponse with error details
 *
 * @example
 * try {
 *   const order = await wcApi.get('orders/123');
 * } catch (error) {
 *   return handleApiError(error, '/api/orders/[orderId]');
 * }
 *
 * @example
 * // With custom message and type
 * if (!orderId) {
 *   return handleApiError(
 *     new Error('Order ID is required'),
 *     '/api/orders/[orderId]',
 *     ErrorType.VALIDATION
 *   );
 * }
 */
export function handleApiError(
  error: any,
  context: string,
  type?: ErrorType
): NextResponse<ErrorResponse> {
  // Extract error message from various error formats
  let errorMessage = 'An unexpected error occurred';
  let errorDetail: string | undefined;
  let detectedType = type;
  let statusCode = 500;

  // Handle WooCommerce API errors (they nest error in response.data)
  if (error?.response?.data) {
    const wooError = error.response.data;
    errorMessage = wooError.message || 'WooCommerce API error';
    errorDetail = wooError.code || JSON.stringify(wooError);
    detectedType = detectedType || ErrorType.WOOCOMMERCE;
    statusCode = error.response.status || 500;

    console.error(`❌ ${context} [WooCommerce]:`, {
      message: errorMessage,
      code: wooError.code,
      status: statusCode,
      data: wooError,
    });
  }
  // Handle standard Error objects
  else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetail = error.stack?.split('\n')[1]?.trim(); // First line of stack trace
    detectedType = detectedType || ErrorType.INTERNAL;

    console.error(`❌ ${context} [${detectedType}]:`, {
      message: errorMessage,
      detail: errorDetail,
    });
  }
  // Handle string errors
  else if (typeof error === 'string') {
    errorMessage = error;
    detectedType = detectedType || ErrorType.INTERNAL;

    console.error(`❌ ${context}:`, errorMessage);
  }
  // Handle unknown error formats
  else {
    errorDetail = JSON.stringify(error);
    detectedType = detectedType || ErrorType.INTERNAL;

    console.error(`❌ ${context} [Unknown]:`, error);
  }

  // Determine status code based on error type
  if (!type) {
    switch (detectedType) {
      case ErrorType.VALIDATION:
        statusCode = 400;
        break;
      case ErrorType.NOT_FOUND:
        statusCode = 404;
        break;
      case ErrorType.UNAUTHORIZED:
        statusCode = 401;
        break;
      case ErrorType.DATABASE:
      case ErrorType.WOOCOMMERCE:
      case ErrorType.INTERNAL:
      default:
        statusCode = 500;
        break;
    }
  }

  // Build response
  const response: ErrorResponse = {
    error: errorMessage,
    timestamp: new Date().toISOString(),
  };

  // Add optional detail in development
  if (process.env.NODE_ENV === 'development' && errorDetail) {
    response.detail = errorDetail;
  }

  if (detectedType) {
    response.type = detectedType;
  }

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Convenience wrapper for validation errors
 *
 * @example
 * if (!email) {
 *   return validationError('Email is required', '/api/customers/search');
 * }
 */
export function validationError(message: string, context: string): NextResponse<ErrorResponse> {
  return handleApiError(new Error(message), context, ErrorType.VALIDATION);
}

/**
 * Convenience wrapper for not found errors
 *
 * @example
 * if (!customer) {
 *   return notFoundError('Customer not found', '/api/customers/[id]');
 * }
 */
export function notFoundError(message: string, context: string): NextResponse<ErrorResponse> {
  return handleApiError(new Error(message), context, ErrorType.NOT_FOUND);
}

/**
 * Convenience wrapper for unauthorized errors
 *
 * @example
 * if (!isAdmin) {
 *   return unauthorizedError('Admin access required', '/api/admin/orders');
 * }
 */
export function unauthorizedError(message: string, context: string): NextResponse<ErrorResponse> {
  return handleApiError(new Error(message), context, ErrorType.UNAUTHORIZED);
}
