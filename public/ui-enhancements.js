
// UI Enhancements JS - handles payment sheet, toasts, bottom sheet, dark toggle, and premium animations
(function(){
  // Toast system
  window.lmToast = function(message, type='info', timeout=3000){
    const containerId = 'lm-toast-container';
    let container = document.getElementById(containerId);
    if(!container){
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'toast-container';
      container.style.position = 'fixed';
      container.style.right = '16px';
      container.style.top = '16px';
      container.style.zIndex = 9999;
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.background = (type==='success')? 'linear-gradient(90deg,var(--success),#059669)': (type==='error')? 'linear-gradient(90deg,var(--danger),#ef4444)' : 'linear-gradient(90deg,var(--accent),#7c3aed)';
    el.innerText = message;
    container.appendChild(el);
    setTimeout(()=> el.style.opacity = '0', timeout - 300);
    setTimeout(()=> el.remove(), timeout);
  };

  // Bottom sheet open/close
  window.openPaymentSheet = function(amount){
    const sheet = document.getElementById('payment-sheet');
    if(!sheet) return;
    document.getElementById('payment-amount').innerText = '₹' + (amount || 1);
    sheet.classList.add('show');
    sheet.setAttribute('aria-hidden','false');
    // Load the QR from API
    if (window.loadUpiQr) {
      window.loadUpiQr(amount).then(()=> {
        // fetch upi intent to set button link
        fetch('/api/payment/create', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          credentials: 'include',
          body: JSON.stringify({ amount: amount || 1 })
        }).then(r=> r.json()).then(data=>{
          if(data && data.upiString){
            const btn = document.getElementById('upi-intent-btn');
            btn.href = data.upiString;
          }
        }).catch(()=>{});
      }).catch(()=>{});
    } else {
      console.warn('loadUpiQr not present');
    }
    document.body.style.overflow = 'hidden';
  };
  window.closePaymentSheet = function(){
    const sheet = document.getElementById('payment-sheet');
    if(!sheet) return;
    sheet.classList.remove('show');
    sheet.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  };

  // Mobile bottom sheet drag to close (simple)
  (function(){
    const sheet = document.getElementById('payment-sheet');
    if(!sheet) return;
    let startY=0, cur=0;
    sheet.addEventListener('touchstart', (e)=> {
      startY = e.touches[0].clientY;
    });
    sheet.addEventListener('touchmove', (e)=> {
      cur = e.touches[0].clientY - startY;
      if(cur>0) sheet.style.transform = `translateY(${cur}px)`;
    });
    sheet.addEventListener('touchend', ()=> {
      sheet.style.transform = '';
      if(cur > 120) window.closePaymentSheet();
      cur = 0;
    });
  })();

  // Dark mode quick toggle
  window.toggleDark = function(force){
    if(force === 'dark') document.documentElement.classList.add('dark');
    else if(force === 'light') document.documentElement.classList.remove('dark');
    else document.documentElement.classList.toggle('dark');
    lmToast('Theme changed', 'info', 1200);
  };

  // Add premium UI class hooks
  document.documentElement.classList.add('lm-ui-ready');

  // Product card effects: add class to any product cards found
  document.querySelectorAll('.product-card').forEach(el=>{
    el.classList.add('product-card-hover', 'lm-pop');
    setTimeout(()=> el.classList.add('lm-show'), 100);
  });

  // Order timeline example (if order-timeline container exists)
  document.querySelectorAll('.order-timeline').forEach((el)=>{
    el.querySelectorAll('.order-step').forEach((step, idx)=>{
      step.style.transitionDelay = (idx*80) + 'ms';
      setTimeout(()=> step.classList.add('lm-show'), 120 + idx*80);
    });
  });

})();
