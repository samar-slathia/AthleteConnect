import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Send, AlertCircle, MessageCircle } from 'lucide-react-native';
import { BookingItem, BookingMessageItem, getBookingMessages, sendBookingMessage } from '../../../services/bookingApi';
import { getQuickMessagesForRole } from '../../../data/quickMessages';
import { COLORS, RADII, SPACING, TYPOGRAPHY } from '../../../theme/tokens';

export interface BookingChatModalProps {
  visible: boolean;
  onClose: () => void;
  booking: BookingItem | null;
  token?: string | null;
  currentUserRole: 'coach' | 'parent' | 'individual' | 'admin';
  currentUserId?: string;
}

function formatMessageTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

export const BookingChatModal: React.FC<BookingChatModalProps> = ({
  visible,
  onClose,
  booking,
  token,
  currentUserRole,
  currentUserId,
}) => {
  const [messages, setMessages] = useState<BookingMessageItem[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const quickMessages = getQuickMessagesForRole(currentUserRole);

  const isClosed = booking?.status === 'rejected' || booking?.status === 'cancelled';

  const loadMessages = useCallback(async () => {
    if (!token || !booking?._id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const msgs = await getBookingMessages(token, booking._id);
      setMessages(msgs);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load messages.');
    } finally {
      setIsLoading(false);
    }
  }, [token, booking?._id]);

  useEffect(() => {
    if (visible && booking?._id) {
      setInputText('');
      setSendError(null);
      loadMessages();
    } else {
      setMessages([]);
      setInputText('');
      setErrorMessage(null);
      setSendError(null);
    }
  }, [visible, booking?._id, loadMessages]);

  const handleSendMessage = async (textToSend: string) => {
    if (!token || !booking?._id) {
      setSendError('Authentication token or booking is missing.');
      return;
    }

    const trimmed = textToSend.trim();
    if (!trimmed) return;

    if (trimmed.length > 1000) {
      setSendError('Message text cannot exceed 1000 characters.');
      return;
    }

    if (isSending) return; // Prevent duplicate sends

    setIsSending(true);
    setSendError(null);

    try {
      const sentMessage = await sendBookingMessage(token, booking._id, trimmed);
      setInputText('');
      setMessages((prev) => [...prev, sentMessage]);
      // Also refresh from server to ensure perfect sync
      const freshMsgs = await getBookingMessages(token, booking._id);
      setMessages(freshMsgs);
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  if (!booking) return null;

  const otherParticipantName =
    currentUserRole === 'coach'
      ? booking.customerName || 'Trainee'
      : booking.coachName || 'Coach';

  const isTextValid = inputText.trim().length > 0 && inputText.length <= 1000;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Chat: {booking.sport?.toUpperCase()} Session
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              With {otherParticipantName} â€¢ {booking.date}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close Chat"
            testID="chat-close-button"
          >
            <X size={20} color={COLORS.navy} />
          </TouchableOpacity>
        </View>

        {/* Closed Conversation Notice */}
        {isClosed ? (
          <View style={styles.closedBanner} testID="chat-closed-banner">
            <AlertCircle size={14} color="#DC2626" />
            <Text style={styles.closedBannerText}>
              This conversation is closed because the booking is {booking.status}.
            </Text>
          </View>
        ) : null}

        {/* Message History */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
          testID="chat-message-list"
        >
          {isLoading ? (
            <View style={styles.centerBox} testID="chat-loading-indicator">
              <ActivityIndicator size="small" color={COLORS.navy} />
              <Text style={styles.loadingText}>Loading conversation...</Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.centerBox} testID="chat-error-container">
              <AlertCircle size={22} color="#DC2626" />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadMessages}
                accessibilityRole="button"
                accessibilityLabel="Retry loading messages"
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.centerBox} testID="chat-empty-state">
              <MessageCircle size={32} color={COLORS.navyMuted} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySubtitle}>
                Send a message or choose a quick suggestion below to start the conversation.
              </Text>
            </View>
          ) : (
            messages.map((msg) => {
              const isMine =
                (currentUserId && msg.senderId === currentUserId) ||
                msg.senderRole === currentUserRole;

              return (
                <View
                  key={msg._id}
                  style={[
                    styles.messageBubbleWrap,
                    isMine ? styles.myMessageWrap : styles.theirMessageWrap,
                  ]}
                  testID={`chat-message-${msg._id}`}
                >
                  {!isMine ? (
                    <Text style={styles.senderLabel}>
                      {msg.senderName || otherParticipantName}
                    </Text>
                  ) : null}

                  <View
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myMessageBubble : styles.theirMessageBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isMine ? styles.myMessageText : styles.theirMessageText,
                      ]}
                    >
                      {msg.text}
                    </Text>
                    <Text
                      style={[
                        styles.timeText,
                        isMine ? styles.myTimeText : styles.theirTimeText,
                      ]}
                    >
                      {formatMessageTime(msg.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Send Error Notice */}
        {sendError ? (
          <View style={styles.sendErrorBanner} testID="chat-send-error">
            <AlertCircle size={13} color="#DC2626" />
            <Text style={styles.sendErrorText}>{sendError}</Text>
          </View>
        ) : null}

        {/* Quick Message Chips (Compact Horizontally Scrollable Row) */}
        {!isClosed ? (
          <View style={styles.quickMessagesSection} testID="quick-messages-section">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickMessagesRow}
              keyboardShouldPersistTaps="handled"
            >
              {quickMessages.map((text, idx) => (
                <TouchableOpacity
                  key={`quick-msg-${idx}`}
                  style={[styles.quickMessageChip, isSending && styles.btnDisabled]}
                  onPress={() => handleSendMessage(text)}
                  disabled={isSending}
                  accessibilityRole="button"
                  accessibilityLabel={`Quick send: ${text}`}
                  testID={`quick-msg-chip-${idx}`}
                >
                  <Text style={styles.quickMessageChipText}>{text}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Input Bar */}
        {!isClosed ? (
          <View style={styles.inputContainer}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={(val) => {
                  setInputText(val);
                  if (sendError) setSendError(null);
                }}
                placeholder="Type a message (max 1000 characters)..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={1000}
                editable={!isSending}
                testID="chat-input-text"
              />
              {inputText.length > 800 ? (
                <Text
                  style={[
                    styles.charCounter,
                    inputText.length > 1000 && styles.charCounterLimit,
                  ]}
                >
                  {inputText.length}/1000
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={[
                styles.sendButton,
                (!isTextValid || isSending) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSendMessage(inputText)}
              disabled={!isTextValid || isSending}
              accessibilityRole="button"
              accessibilityLabel="Send Message"
              testID="chat-send-button"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={COLORS.navy} />
              ) : (
                <Send size={18} color={isTextValid ? COLORS.navy : COLORS.textMuted} />
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mist,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  headerTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 16,
    color: COLORS.navy,
  },
  headerSubtitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  closeButton: {
    padding: SPACING.xs,
    borderRadius: RADII.sm,
  },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  closedBannerText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  centerBox: {
    paddingVertical: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 13,
    color: '#DC2626',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.mist,
  },
  retryButtonText: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.navy,
  },
  emptyTitle: {
    ...TYPOGRAPHY.bodyBold,
    fontSize: 15,
    color: COLORS.navy,
    marginTop: SPACING.sm,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.caption,
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 260,
  },
  messageBubbleWrap: {
    marginVertical: 4,
    maxWidth: '82%',
  },
  myMessageWrap: {
    alignSelf: 'flex-end',
  },
  theirMessageWrap: {
    alignSelf: 'flex-start',
  },
  senderLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 2,
    marginLeft: 4,
  },
  messageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADII.md,
  },
  myMessageBubble: {
    backgroundColor: COLORS.lime,
    borderBottomRightRadius: 2,
  },
  theirMessageBubble: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 2,
  },
  messageText: {
    ...TYPOGRAPHY.body,
    fontSize: 13.5,
    lineHeight: 18,
  },
  myMessageText: {
    color: COLORS.navy,
  },
  theirMessageText: {
    color: COLORS.textPrimary,
  },
  timeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  myTimeText: {
    color: COLORS.navyMuted,
  },
  theirTimeText: {
    color: COLORS.textMuted,
  },
  sendErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    backgroundColor: '#FEF2F2',
  },
  sendErrorText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    color: '#DC2626',
    flex: 1,
  },
  quickMessagesSection: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 6,
  },
  quickMessagesRow: {
    paddingHorizontal: SPACING.sm,
    gap: 6,
  },
  quickMessageChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.mist,
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickMessageChipText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.navy,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 6,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: COLORS.mist,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    minHeight: 38,
    maxHeight: 100,
    justifyContent: 'center',
  },
  textInput: {
    ...TYPOGRAPHY.body,
    fontSize: 13,
    color: COLORS.textPrimary,
    paddingTop: 2,
    paddingBottom: 2,
  },
  charCounter: {
    ...TYPOGRAPHY.caption,
    fontSize: 10,
    color: COLORS.textMuted,
    alignSelf: 'flex-end',
  },
  charCounterLimit: {
    color: '#DC2626',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: RADII.md,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.mist,
    opacity: 0.6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
