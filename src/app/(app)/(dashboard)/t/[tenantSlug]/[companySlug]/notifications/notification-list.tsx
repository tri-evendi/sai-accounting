"use client";

/**
 * Daftar pemberitahuan — daun client yang HANYA menggambar.
 *
 * Tidak ada state, tidak ada pengambilan data, tidak ada penandaan terbaca:
 * semuanya sudah dikerjakan server component induknya. Ia client semata karena
 * `theme.useToken()` dan `Card` AntD menuntutnya.
 *
 * Yang belum terbaca ditandai DUA HAL sekaligus — pita warna DAN kata
 * "Belum dibaca" (MASTER.md §Anti-Patterns: warna tidak pernah jadi satu-satunya
 * penanda).
 */
import { Flex, Typography, theme } from "antd";

import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const { Text, Title } = Typography;

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  href: string | null;
  unread: boolean;
  when: string;
}

export function NotificationList({
  items,
  openLabel,
  unreadLabel,
}: {
  items: NotificationItem[];
  openLabel: string;
  unreadLabel: string;
}) {
  const { token } = theme.useToken();

  return (
    <Flex vertical gap={token.marginSM}>
      {items.map((item) => (
        <Card
          key={item.id}
          style={
            item.unread
              ? { borderInlineStartWidth: 3, borderInlineStartColor: token.colorPrimary }
              : undefined
          }
        >
          <CardContent>
            <Flex vertical gap={token.marginXXS}>
              <Flex align="center" gap={token.marginXS} wrap>
                <Title level={3} style={{ fontSize: token.fontSize, marginBlock: 0 }}>
                  {item.title}
                </Title>
                {item.unread && <Badge variant="default">{unreadLabel}</Badge>}
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {item.when}
                </Text>
              </Flex>
              <Text>{item.body}</Text>
              {item.href && (
                <div style={{ marginTop: token.marginXS }}>
                  <ButtonLink href={item.href} variant="secondary" size="sm">
                    {openLabel}
                  </ButtonLink>
                </div>
              )}
            </Flex>
          </CardContent>
        </Card>
      ))}
    </Flex>
  );
}
