import React, { useState } from 'react';

const FeedbackTab: React.FC = () => {
  // State for form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8888/.netlify/functions/send-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });
      if (response.ok) {
        setSuccess('Thank you for your feedback!');
        setName('');
        setEmail('');
        setSubject('');
        setMessage('');
      } else {
        const data = await response.json();
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="box" style={{ maxWidth: 420, margin: '0 auto', background: '#232323', borderRadius: 12, padding: 24 }}>
      <h2 style={{ color: '#fff', marginBottom: 8 }}>Contact Us</h2>
      <p style={{ marginBottom: 20, color: '#ccc', fontSize: '1em' }}>
        Have feedback, suggestions, or need help? We'd love to hear from you!
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="name" style={{ color: '#ccc', marginBottom: 4, display: 'block' }}>Name</label>
          <input
            id="name"
            type="text"
            className="input"
            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: 8, width: '100%' }}
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="name"
            disabled={loading}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={{ color: '#ccc', marginBottom: 4, display: 'block' }}>Email</label>
          <input
            id="email"
            type="email"
            className="input"
            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: 8, width: '100%' }}
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 16 }}>
          <label htmlFor="subject" style={{ color: '#ccc', marginBottom: 4, display: 'block' }}>Subject</label>
          <input
            id="subject"
            type="text"
            className="input"
            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: 8, width: '100%' }}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label htmlFor="message" style={{ color: '#ccc', marginBottom: 4, display: 'block' }}>Message</label>
          <textarea
            id="message"
            className="textarea"
            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: 8, width: '100%', minHeight: 100, resize: 'vertical' }}
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={loading}
          />
        </div>
        {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}
        {success && <div style={{ color: '#47d47a', marginBottom: 12 }}>{success}</div>}
        <button
          type="submit"
          className="button"
          style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', fontWeight: 500, fontSize: '1em', cursor: loading ? 'not-allowed' : 'pointer', width: 80 }}
          disabled={loading}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default FeedbackTab; 