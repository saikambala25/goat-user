
// QR helper injected by assistant
// Clear any old localStorage QR entry and provide a function to fetch and set the QR image from API.
try {
  localStorage.removeItem('upiQR');
  localStorage.removeItem('qrPath');
} catch (e) {
  // ignore
}

window.loadUpiQr = async function(amount) {
  try {
    const res = await fetch('/api/payment/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount: amount || 1 })
    });
    if (!res.ok) {
      console.error('Failed to create payment session', await res.text());
      return;
    }
    const data = await res.json();
    if (data && data.qrPath) {
      const img = document.getElementById('qr-image') || document.querySelector('img[data-upi-qr]');
      if (img) {
        img.src = data.qrPath;
      } else {
        console.warn('No img#qr-image or img[data-upi-qr] found to set QR image.');
      }
    }
  } catch (err) {
    console.error('loadUpiQr error', err);
  }
};
