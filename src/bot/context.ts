import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor, Conversation } from '@grammyjs/conversations';
import { User, Role } from '@prisma/client';

export interface SessionData {
  currentPost?: string;
  selectedCategoryId?: number;
  tempData?: {
    orderRequestId?: number;
    rejectRequestId?: number;
    checklistItems?: any[];
    checklistIndex?: number;
    ordersToCreate?: any[];
    [key: string]: any;
  };
}

export type BaseContext = Context &
  SessionFlavor<SessionData> & {
    dbUser?: User;
    userRole?: Role;
  };

export type BotContext = ConversationFlavor<BaseContext>;

export type BotConversation = Conversation<BaseContext, BaseContext>;
