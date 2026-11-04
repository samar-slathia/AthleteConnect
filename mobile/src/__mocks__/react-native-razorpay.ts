const RazorpayCheckout = {
  open: (_options: any) =>
    Promise.resolve({
      razorpay_payment_id: 'pay_mock_default_123',
      razorpay_order_id: 'order_mock_default_123',
      razorpay_signature: 'signature_mock_default_123',
    }),
  onExternalWalletSelection: (_callback: any) => {},
};

export default RazorpayCheckout;
