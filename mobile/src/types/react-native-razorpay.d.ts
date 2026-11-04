declare module 'react-native-razorpay' {
  export interface RazorpayCheckoutOptions {
    description?: string;
    image?: string;
    currency: string;
    key: string;
    amount: number;
    name: string;
    order_id: string;
    prefill?: {
      email?: string;
      contact?: string;
      name?: string;
      method?: 'upi' | 'card' | 'netbanking' | 'wallet';
    };
    theme?: {
      color?: string;
      backdrop_color?: string;
      hide_topbar?: boolean;
    };
    notes?: Record<string, string>;
    modal?: {
      backdropclose?: boolean;
      escape?: boolean;
      handleback?: boolean;
      confirm_close?: boolean;
      animation?: boolean;
      ondismiss?: () => void;
    };
  }

  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    code: number;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
    metadata?: Record<string, any>;
  }

  export default class RazorpayCheckout {
    static open(
      options: RazorpayCheckoutOptions,
      successCallback?: (data: RazorpaySuccessResponse) => void,
      errorCallback?: (data: RazorpayErrorResponse) => void
    ): Promise<RazorpaySuccessResponse>;

    static onExternalWalletSelection(
      callback: (data: { external_wallet: string }) => void
    ): void;
  }
}
