'use strict';

const { query } = require('../db');

async function upsertChannel({ channelId, title = '', linkedByUserId = '', linkedByName = '', botAccess = true }) {
  const id = String(channelId || '').trim();
  if (!id) throw new Error('channel_id_required');
  const result = await query(
    `insert into channels(id,title,linked_by_user_id,linked_by_name,bot_access,updated_at)
     values($1,$2,$3,$4,$5,now())
     on conflict(id) do update set
       title=coalesce(nullif($2,''), channels.title),
       linked_by_user_id=coalesce(nullif($3,''), channels.linked_by_user_id),
       linked_by_name=coalesce(nullif($4,''), channels.linked_by_name),
       bot_access=$5,
       updated_at=now()
     returning *`,
    [id, String(title || '').trim(), String(linkedByUserId || '').trim(), String(linkedByName || '').trim(), Boolean(botAccess)]
  );
  return result.rows[0];
}

async function listChannels({ linkedByUserId = '', limit = 30 } = {}) {
  const userId = String(linkedByUserId || '').trim();
  const result = await query(
    `select * from channels
     where ($1 = '' or linked_by_user_id = $1)
     order by updated_at desc
     limit $2`,
    [userId, Math.max(1, Math.min(Number(limit || 30), 100))]
  );
  return result.rows;
}

module.exports = { upsertChannel, listChannels };
