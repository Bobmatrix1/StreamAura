/**
 * Payment API Service
 * Handles Paystack inline integration and backend verification.
 */

import { API_BASE_URL } from './mediaApi';

declare const CheckoutNS: any;

export const initializeTransactPayPayment = async (
  email: string, 
  amount: number, 
  metadata: any,
  onSuccess: (reference: string) => void,
  onClose: () => void
) => {
  const firstName = metadata?.firstName || 'Customer';
  const lastName = metadata?.lastName || 'User';
  const mobile = metadata?.mobile || '+2348000000000';
  const country = 'NG';
  
  let reference = '';
  if (metadata?.type === 'wallet_funding') {
    reference = `deposit_${metadata.user_uid}_${amount}_${Date.now()}`;
  } else if (metadata?.room_id) {
    reference = `ticket_${metadata.room_id}_${metadata.user_uid}_${amount}_${Date.now()}`;
  } else {
    reference = `tp_${amount}_${Date.now()}`;
  }

  const closeTransactPayDOM = () => {
    // 1. Remove TransactPay iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe: HTMLIFrameElement) => {
      if (iframe.src.includes('transactpay') || iframe.id.includes('transactpay') || iframe.className.includes('transactpay')) {
        iframe.remove();
      }
    });

    // 2. Remove elements with transactpay in class/ID
    const overlays = document.querySelectorAll('[id*="transactpay"], [class*="transactpay"]');
    overlays.forEach(el => el.remove());

    // 3. Find and remove any external full-screen fixed overlays outside the React root
    const divs = document.querySelectorAll('div');
    divs.forEach((div: HTMLDivElement) => {
      try {
        const style = window.getComputedStyle(div);
        const isFixedOrAbsolute = style.position === 'fixed' || style.position === 'absolute';
        const isFullScreen = (
          (style.width === '100vw' || style.width === '100%' || div.offsetWidth >= window.innerWidth - 10) &&
          (style.height === '100vh' || style.height === '100%' || div.offsetHeight >= window.innerHeight - 10)
        );
        const zIndex = parseInt(style.zIndex);
        const hasHighZIndex = !isNaN(zIndex) && zIndex > 50;
        const isInsideReactRoot = document.getElementById('root')?.contains(div);

        if (isFixedOrAbsolute && isFullScreen && hasHighZIndex && !isInsideReactRoot && div.id !== 'root') {
          console.log('Clearing external overlay div:', div);
          div.remove();
        }
      } catch (e) {
        // Safe catch
      }
    });

    // 4. Force reset scrolling and pointer events on body and document elements
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.body.style.pointerEvents = 'auto';
    
    document.documentElement.style.overflow = '';
    document.documentElement.style.pointerEvents = 'auto';

    // Remove any overflow-hidden classes if dynamically added
    document.body.classList.remove('overflow-hidden');
    document.documentElement.classList.remove('overflow-hidden');
  };

  let isCallbackTriggered = false;

  const cleanupAndClose = () => {
    if (isCallbackTriggered) return;
    isCallbackTriggered = true;
    closeTransactPayDOM();
    onClose();
  };

  const cleanupAndSuccess = (ref: string) => {
    if (isCallbackTriggered) return;
    isCallbackTriggered = true;
    closeTransactPayDOM();
    onSuccess(ref);
  };

  try {
    const Checkout = new CheckoutNS.PaymentCheckout({
      firstName,
      lastName,
      mobile,
      country,
      email,
      currency: 'NGN',
      amount: amount, // Raw Naira amount (TransactPay SDK uses standard decimals/Naira, not Kobo)
      reference: reference,
      merchantReference: reference,
      description: metadata?.description || (metadata?.type === 'wallet_funding' ? 'Wallet Top-up' : 'Cinema Ticket Purchase'),
      apiKey: import.meta.env.VITE_TRANSACTPAY_PUBLIC_KEY,
      encryptionKey: import.meta.env.VITE_TRANSACTPAY_ENCRYPTION_KEY,
      onCompleted: (data: any) => {
        console.log('TransactPay Completed:', data);
        // ONLY trigger success if the transaction status is explicitly successful.
        // Checking data?.statusCode === '00' here is incorrect because the gateway returns
        // statusCode: '00' for virtual account generation requests (which are pending payments).
        if (data?.status?.toLowerCase() === 'successful') {
          cleanupAndSuccess(reference);
        } else if (data?.status?.toLowerCase() === 'failed') {
          cleanupAndClose();
        }
      },
      onClose: () => {
        cleanupAndClose();
      },
      onError: (err: any) => {
        console.error('TransactPay Error:', err);
        cleanupAndClose();
      }
    });

    Checkout.init();
  } catch (error) {
    console.error('Failed to initialize TransactPay Checkout:', error);
    cleanupAndClose();
  }
};

export const initializePaystackPayment = initializeTransactPayPayment;

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
