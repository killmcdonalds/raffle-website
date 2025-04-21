document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('entry-form');
    const resultDiv = document.getElementById('result');
    const cardErrors = document.getElementById('card-errors');
  
    // Initialize Stripe
    const stripe = Stripe('pk_test_51RGOSxQT1SwZPlh2tYvJVHiPnsr9V2uU9HwJfBiQI08TjeKZHzduBJr34tkG1HwICX2r8bEQ1WZ375ECQbTf5MxL00lDNRwCXz'); // Replace with your pk_test_...
    const elements = stripe.elements();
    const card = elements.create('card');
    card.mount('#card-element');
  
    // Handle card input errors
    card.on('change', (event) => {
      if (event.error) {
        cardErrors.textContent = event.error.message;
      } else {
        cardErrors.textContent = '';
      }
    });
  
    // Update raffle status
    function updateRaffleStatus() {
      fetch('/raffle-status')
        .then(response => response.json())
        .then(data => {
          document.getElementById('10-ticket-count').textContent = data['10-ticket'].entries.length;
          document.getElementById('100-ticket-count').textContent = data['100-ticket'].entries.length;
          document.getElementById('100-ticket-high-count').textContent = data['100-ticket-high'].entries.length;
        });
    }
  
    updateRaffleStatus();
  
    // Handle form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      resultDiv.textContent = 'Processing...';
  
      const raffleType = document.getElementById('raffle-type').value;
      const ticketQuantity = parseInt(document.getElementById('ticket-quantity').value);
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
  
      // Create payment method
      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: card,
        billing_details: { name, email },
      });
  
      if (error) {
        cardErrors.textContent = error.message;
        resultDiv.textContent = '';
        return;
      }
  
      // Send entry to backend
      const response = await fetch('/enter-raffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raffleType, ticketQuantity, name, email, paymentMethodId: paymentMethod.id }),
      });
  
      const data = await response.json();
  
      if (data.success) {
        updateRaffleStatus();
        if (data.winners) {
          resultDiv.innerHTML = `
            <h3>Raffle Complete! Winners:</h3>
            <p>1st Place: ${data.winners[0].name} (${data.winners[0].email})</p>
            <p>2nd Place: ${data.winners[1].name} (${data.winners[1].email})</p>
            <p>3rd Place: ${data.winners[2].name} (${data.winners[2].email})</p>
          `;
        } else {
          resultDiv.textContent = `Entry successful! Purchased ${ticketQuantity} ticket(s).`;
        }
      } else {
        resultDiv.textContent = `Error: ${data.error}`;
        cardErrors.textContent = '';
      }
    });
  });