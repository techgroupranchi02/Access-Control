/**
 * ChatPage (Communications) Component
 * Role-scoped festival comms:
 * - Admin sees all channels ('Jury', 'Tasks')
 * - Jury sees 'Jury'
 * - Volunteer sees 'Tasks'
 * - Message feeds and live posting
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function ChatPage() {
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchChannels = async () => {
    try {
      setLoading(true);
      const res = await api.get('/chat/channels');
      const chs = res.data.channels || [];
      setChannels(chs);
      if (chs.length > 0 && !activeChannel) {
        setActiveChannel(chs[0]);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const fetchMessages = async (channelId) => {
    if (!channelId) return;
    try {
      const res = await api.get(`/chat/channels/${channelId}/messages`);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel.id);
    }
  }, [activeChannel]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChannel) return;
    try {
      await api.post(`/chat/channels/${activeChannel.id}/messages`, {
        content: newMessage.trim()
      });
      setNewMessage('');
      fetchMessages(activeChannel.id);
    } catch (err) {
      alert('Failed to send message.');
    }
  };

  return (
    <div className="fc-chat-page" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
      <div className="fc-page-header" style={{ marginBottom: '14px' }}>
        <div>
          <h1 className="fc-page-title">Communications & Channels</h1>
          <p className="fc-page-subtitle">
            Role-scoped channels for Juries, Volunteers, and Control Tower
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: 0 }}>
        {/* Channel List */}
        <div className="fc-card" style={{ width: '260px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--fc-text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            Channels ({channels.length})
          </div>
          {loading ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--fc-text-muted)', padding: '12px' }}>Loading channels...</div>
          ) : (
            channels.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveChannel(c)}
                style={{
                  textAlign: 'left',
                  background: activeChannel?.id === c.id ? 'var(--fc-brand-active-bg)' : 'transparent',
                  color: activeChannel?.id === c.id ? 'var(--fc-brand)' : 'var(--fc-text-main)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-family)',
                  fontSize: '0.825rem',
                  fontWeight: activeChannel?.id === c.id ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                # {c.name}
              </button>
            ))
          )}
        </div>

        {/* Chat Feed */}
        <div className="fc-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--fc-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}># {activeChannel?.name || 'Channel'}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted)' }}>{activeChannel?.description}</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', color: 'var(--fc-text-muted)', fontSize: '0.85rem' }}>
                No messages yet. Send the first update!
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: '10px' }}>
                  <div className="fc-avatar" style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}>
                    {m.sender_name?.slice(0, 2).toUpperCase() || 'FC'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#1a1a1a' }}>{m.sender_name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--fc-text-muted)' }}>
                        {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--fc-text-secondary)', marginTop: '2px', background: 'var(--fc-surface)', padding: '8px 12px', borderRadius: '8px', display: 'inline-block' }}>
                      {m.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Input */}
          <form onSubmit={handleSendMessage} style={{ padding: '14px 20px', borderTop: '1px solid var(--fc-border-subtle)', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder={`Message #${activeChannel?.name || 'channel'}...`}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid var(--fc-border-strong)',
                fontFamily: 'var(--font-family)',
                fontSize: '0.85rem'
              }}
            />
            <button type="submit" className="fc-btn-primary">
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
