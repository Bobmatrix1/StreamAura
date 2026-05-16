/**
 * Payment API Service
 * Handles Paystack inline integration and backend verification.
 */

import { API_BASE_URL } from './mediaApi';

declare const PaystackPop: any;

export const initializePaystackPayment = async (
  email: string, 
  amount: number, 
  metadata: any,
  onSuccess: (reference: string) => void,
  onClose: () => void
) => {
  const handler = PaystackPop.setup({
    key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
    email,
    amount: amount * 100, // Naira to Kobo
    currency: 'NGN',
    metadata,
    callback: (response: any) => {
      onSuccess(response.reference);
    },
    onClose: () => {
      onClose();
    }
  });
  handler.openIframe();
};

export const verifyPaymentOnBackend = async (roomId: string, reference: string, token: string) => {
  const response = await fetch(`${API_BASE_URL}/api/cinema/rooms/${roomId}/verify-payment?reference=${reference}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return await response.json();
};

export const fetchBanks = async () => {
  const response = await fetch(`${API_BASE_URL}/api/cinema/banks`);
  return await response.json();
};

export const resolveBankAccount = async (accountNumber: string, bankCode: string) => {
  const response = await fetch(`${API_BASE_URL}/api/cinema/resolve-account?account_number=${accountNumber}&bank_code=${bankCode}`);
  return await response.json();
};
