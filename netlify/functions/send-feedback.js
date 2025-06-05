export default async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { name, email, subject, message } = JSON.parse(event.body);

  // Compose the email
  const emailData = {
    from: 'Lightning Bolt Fix <no-reply@yourdomain.com>',
    to: 'cristo@cristolopez.com', // <-- Updated to your real email
    subject: subject || 'New Feedback',
    html: `
      <h3>New Feedback Submission</h3>
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Subject:</b> ${subject}</p>
      <p><b>Message:</b><br/>${message.replace(/\n/g, '<br/>')}</p>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_WnBsp6fy_M9wt8GG2EzzL72cT56gNgfej',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const error = await response.text();
      return { statusCode: 500, body: JSON.stringify({ error }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}; 