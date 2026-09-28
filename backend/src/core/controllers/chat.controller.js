/**
 * Chat & Communications Controller
 * Real MySQL queries for role-scoped channels and communication feeds:
 * - Admin sees all channels ('grp-judges', 'grp-tasks')
 * - Judge sees 'grp-judges'
 * - Volunteer sees 'grp-tasks'
 */

const { query } = require('../../config/database');

/**
 * GET /api/chat/channels
 */
async function listChannels(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || 1;
    const userId = req.user.id;

    // Check user role
    const groupRows = await query(`
      SELECT g.group_key 
      FROM user_event_groups ueg
      JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE ueg.user_id = ? AND ueg.event_id = ?
    `, [userId, eventId]);

    const userRoles = groupRows.map(g => g.group_key);
    const isAdmin = userRoles.includes('admin') || (req.user && req.user.isSuperAdmin);

    const allChannels = await query('SELECT * FROM chat_channels WHERE event_id = ? ORDER BY id ASC', [eventId]);

    const accessible = allChannels.filter(c => {
      if (isAdmin) return true;
      if (!c.visible_to_roles) return true;
      try {
        const allowedRoles = typeof c.visible_to_roles === 'string' ? JSON.parse(c.visible_to_roles) : c.visible_to_roles;
        return allowedRoles.some(r => userRoles.includes(r));
      } catch {
        return true;
      }
    });

    res.json({ channels: accessible });
  } catch (error) {
    console.error('[ChatController] listChannels error:', error);
    res.status(500).json({ error: 'Failed to retrieve chat channels.' });
  }
}

/**
 * GET /api/chat/channels/:channelId/messages
 */
async function listMessages(req, res) {
  try {
    const { channelId } = req.params;

    const messages = await query(`
      SELECT 
        cm.id,
        cm.channel_id,
        cm.content,
        cm.created_at,
        u.id as sender_id,
        COALESCE(i.name, o.name, u.email) as sender_name,
        g.label as sender_role
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_user_id
      LEFT JOIN individuals i ON i.user_id = u.id
      LEFT JOIN organizations o ON o.user_id = u.id
      LEFT JOIN user_event_groups ueg ON ueg.user_id = u.id AND ueg.event_id = 1
      LEFT JOIN \`groups\` g ON g.id = ueg.group_id
      WHERE cm.channel_id = ?
      ORDER BY cm.created_at ASC
    `, [channelId]);

    res.json({
      channelId,
      messages: messages.map(m => ({
        ...m,
        isMe: m.sender_id === req.user.id
      }))
    });
  } catch (error) {
    console.error('[ChatController] listMessages error:', error);
    res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
}

/**
 * POST /api/chat/channels/:channelId/messages
 */
async function sendMessage(req, res) {
  try {
    const { channelId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty.' });
    }

    const msgId = `msg-${Date.now()}`;
    await query(`
      INSERT INTO chat_messages (id, channel_id, sender_user_id, content)
      VALUES (?, ?, ?, ?)
    `, [msgId, channelId, req.user.id, content.trim()]);

    res.status(201).json({
      message: 'Message sent.',
      data: {
        id: msgId,
        channel_id: channelId,
        sender_id: req.user.id,
        sender_name: req.user.name,
        content: content.trim(),
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[ChatController] sendMessage error:', error);
    res.status(500).json({ error: 'Failed to send message.' });
  }
}

module.exports = { listChannels, listMessages, sendMessage };
