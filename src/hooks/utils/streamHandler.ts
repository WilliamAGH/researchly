import { Dispatch, SetStateAction } from "react";
import { ChatState } from "@/hooks/useChatState";
import type { Message, MessageStreamChunk } from "@/lib/types/message";
import type { StreamingPersistPayload } from "../../../convex/schemas/agents";
import { logger } from "@/lib/logger";
import { updateMessageById } from "@/hooks/utils/messageStateUpdaters";

/**
 * Handles processing of stream events for the chat UI.
 * Encapsulates the state accumulation and UI updates during streaming.
 */
export class StreamEventHandler {
  private fullContent = "";
  private accumulatedReasoning = "";
  private persistedDetails: StreamingPersistPayload | null = null;
  private persistedConfirmed = false;
  private workflowId: string | null = null;

  constructor(
    private readonly setState: Dispatch<SetStateAction<ChatState>>,
    private readonly chatId: string,
    private readonly assistantMessageId: string,
  ) {}

  public getPersistedConfirmed(): boolean {
    return this.persistedConfirmed;
  }

  public getPersistedDetails(): StreamingPersistPayload | null {
    return this.persistedDetails;
  }

  public getFullContent(): string {
    return this.fullContent;
  }

  public getWorkflowId(): string | null {
    return this.workflowId;
  }

  public handle(chunk: MessageStreamChunk): void {
    switch (chunk.type) {
      case "workflow_start":
        this.handleWorkflowStart(chunk);
        return;
      case "progress":
        this.handleProgress(chunk);
        return;
      case "reasoning":
        this.handleReasoning(chunk);
        return;
      case "content":
        this.handleContent(chunk);
        return;
      case "metadata":
        this.handleMetadata(chunk);
        return;
      case "error":
        throw new Error(chunk.error);
      case "complete":
        this.handleComplete();
        return;
      case "persisted":
        this.handlePersisted(chunk);
        break;
    }
  }

  private handleProgress(
    chunk: Extract<MessageStreamChunk, { type: "progress" }>,
  ) {
    this.setState((prev) => ({
      ...prev,
      searchProgress: {
        stage: chunk.stage,
        message: chunk.message,
        urls: chunk.urls,
        currentUrl: chunk.currentUrl,
        queries: chunk.queries,
        sourcesUsed: chunk.sourcesUsed,
        toolReasoning: chunk.toolReasoning,
        toolQuery: chunk.toolQuery,
        toolUrl: chunk.toolUrl,
      },
    }));
    logger.debug("Progress update:", chunk.stage, chunk.message, {
      toolReasoning: chunk.toolReasoning,
      toolQuery: chunk.toolQuery,
    });
  }

  private handleWorkflowStart(
    chunk: Extract<MessageStreamChunk, { type: "workflow_start" }>,
  ) {
    this.workflowId = chunk.workflowId;

    updateMessageById(this.setState, this.assistantMessageId, {
      workflowId: chunk.workflowId,
    });

    logger.debug("Workflow started", {
      chatId: this.chatId,
      workflowId: chunk.workflowId,
    });
  }

  private handleReasoning(
    chunk: Extract<MessageStreamChunk, { type: "reasoning" }>,
  ) {
    this.accumulatedReasoning += chunk.content;
    updateMessageById(this.setState, this.assistantMessageId, {
      reasoning: this.accumulatedReasoning,
      thinking: "Thinking...",
    });
    logger.debug("Reasoning chunk received");
  }

  private handleContent(chunk: {
    type: "content";
    content?: string;
    delta?: string;
  }) {
    const delta = chunk.delta || chunk.content;
    if (delta) {
      this.fullContent += delta;
      updateMessageById(
        this.setState,
        this.assistantMessageId,
        { content: this.fullContent, isStreaming: true, thinking: undefined },
        {
          searchProgress: {
            stage: "generating",
            message: "your answer...",
          },
        },
      );
    }
  }

  private handleMetadata(
    chunk: Extract<MessageStreamChunk, { type: "metadata" }>,
  ) {
    const metadata = chunk.metadata;
    const webResearchSources = metadata.webResearchSources;

    const messageUpdates: Partial<Message> = {
      isStreaming: true,
      thinking: undefined,
    };
    if (metadata.workflowId !== undefined) {
      messageUpdates.workflowId = metadata.workflowId;
    }
    if (webResearchSources !== undefined) {
      messageUpdates.webResearchSources = webResearchSources;
    }
    updateMessageById(this.setState, this.assistantMessageId, messageUpdates);
    logger.debug("Metadata received");
  }

  private handleComplete() {
    updateMessageById(
      this.setState,
      this.assistantMessageId,
      { isStreaming: true, thinking: undefined },
      {
        searchProgress: {
          stage: "finalizing",
          message: "Saving and securing results...",
        },
      },
    );
    logger.debug("Stream complete, awaiting persisted event...");
  }

  private handlePersisted(
    chunk: Extract<MessageStreamChunk, { type: "persisted" }>,
  ) {
    this.persistedConfirmed = true;
    this.persistedDetails = chunk.payload;

    const messageUpdates: Partial<Message> = {
      _id: String(chunk.payload.assistantMessageId),
      content: chunk.payload.answer,
      workflowId: chunk.payload.workflowId,
      webResearchSources: chunk.payload.webResearchSources,
      isStreaming: false,
      thinking: undefined,
      persisted: true,
    };

    // Do not toggle isGenerating here: rapid-send flows can queue additional
    // messages, and we need a single source of truth for generation/busy state.
    updateMessageById(this.setState, this.assistantMessageId, messageUpdates);

    logger.debug("Persistence confirmed via SSE", {
      chatId: this.chatId,
      workflowId: chunk.payload.workflowId,
    });
  }
}
