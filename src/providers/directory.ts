import type { ConversationAccessDto, MemberDto } from '@novachat-enterprise-erp/contracts';
import type { InternalHttpClient } from '@novachat-enterprise-erp/common';

export interface Directory {
  members(workspaceId: string, userIds: string[]): Promise<MemberDto[]>;
  conversationMemberIds(conversationId: string): Promise<string[]>;
}

export class ServiceDirectory implements Directory {
  constructor(
    private readonly workspaces: InternalHttpClient,
    private readonly messages: InternalHttpClient,
  ) {}

  async members(workspaceId: string, userIds: string[]): Promise<MemberDto[]> {
    if (userIds.length === 0) return [];
    const result = await this.workspaces.request<{ items: MemberDto[] }>(`/internal/workspaces/${workspaceId}/members/batch`, {
      method: 'POST',
      body: { userIds: [...new Set(userIds)] },
    });
    return result?.items ?? [];
  }

  async conversationMemberIds(conversationId: string): Promise<string[]> {
    const result = await this.messages.request<ConversationAccessDto>(
      `/internal/conversations/${conversationId}/access/system?includeMembers=true`,
    );
    return result?.memberUserIds ?? [];
  }
}
