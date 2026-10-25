import type { MailMessage } from '../providers/mailer.js';

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const layout = (heading: string, paragraph: string, cta: string, url: string) => `
<div style="font-family:Lato,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#1f2333">
  <div style="width:40px;height:40px;border-radius:10px;background:#5b57d1;color:#fff;font-weight:700;font-size:20px;line-height:40px;text-align:center">N</div>
  <h1 style="font-size:22px;margin:24px 0 8px">${heading}</h1>
  <p style="font-size:15px;line-height:1.6;color:#4a4f63">${paragraph}</p>
  <a href="${url}" style="display:inline-block;margin-top:16px;background:#5b57d1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">${cta}</a>
  <p style="font-size:12px;color:#8a8fa3;margin-top:32px">If the button does not work, open ${url}</p>
</div>`;

export const workspaceInviteEmail = (to: string, workspaceName: string, inviterName: string | null, url: string): MailMessage => {
  const who = inviterName ? `${escape(inviterName)} invited you` : 'You have been invited';
  return {
    to,
    subject: `Join ${workspaceName} on NovaChat`,
    html: layout(`Join ${escape(workspaceName)}`, `${who} to join <b>${escape(workspaceName)}</b> on NovaChat.`, 'Accept invite', url),
    text: `${inviterName ?? 'Someone'} invited you to join ${workspaceName} on NovaChat: ${url}`,
  };
};

export const meetingInviteEmail = (to: string, inviterName: string, title: string, url: string): MailMessage => ({
  to,
  subject: `${inviterName} invited you to ${title}`,
  html: layout(escape(title), `${escape(inviterName)} invited you to a NovaChat meeting.`, 'Join meeting', url),
  text: `${inviterName} invited you to ${title}: ${url}`,
});
