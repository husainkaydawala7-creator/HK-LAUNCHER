package com.hklauncher.client;

import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;

import java.util.List;

public final class HkLoginScreen extends Screen {
    private final Screen parent;
    private final HkBridgeClient bridge = new HkBridgeClient();
    private String status = "Select a saved login. The command is only filled, not sent.";

    public HkLoginScreen(Screen parent) {
        super(Text.literal("HK Login"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        addDrawableChild(ButtonWidget.builder(Text.literal("Back"), button -> client.setScreen(parent))
                .dimensions(width / 2 - 102, height - 34, 98, 20)
                .build());
        addDrawableChild(ButtonWidget.builder(Text.literal("Refresh"), button -> client.setScreen(new HkLoginScreen(parent)))
                .dimensions(width / 2 + 4, height - 34, 98, 20)
                .build());

        if (!bridge.isAvailable()) {
            status = "HK Launcher bridge is unavailable. Launch Minecraft from HK Launcher.";
            return;
        }

        try {
            List<HkBridgeClient.LoginEntry> entries = bridge.listLogins();
            if (entries.isEmpty()) {
                status = "No saved server logins. Add one in HK Launcher > Servers.";
                return;
            }

            int y = 52;
            for (HkBridgeClient.LoginEntry entry : entries.stream().limit(7).toList()) {
                addDrawableChild(ButtonWidget.builder(Text.literal(labelFor(entry)), button -> fillCommand(entry.id()))
                        .dimensions(width / 2 - 130, y, 260, 22)
                        .build());
                y += 27;
            }
        } catch (Exception error) {
            status = error.getMessage();
        }
    }

    @Override
    public void render(net.minecraft.client.gui.DrawContext context, int mouseX, int mouseY, float delta) {
        super.render(context, mouseX, mouseY, delta);
        context.drawCenteredTextWithShadow(textRenderer, title, width / 2, 20, 0xFFFFFF);
        context.drawCenteredTextWithShadow(textRenderer, Text.literal(status), width / 2, 36, 0xE8F7E9);
    }

    private void fillCommand(String id) {
        try {
            String command = bridge.commandFor(id);
            client.setScreen(new ChatScreen(command, false));
        } catch (Exception error) {
            status = error.getMessage();
            clearAndInit();
        }
    }

    private static String labelFor(HkBridgeClient.LoginEntry entry) {
        String label = entry.label().isBlank() ? entry.serverAddress() : entry.label();
        String prefix = entry.commandPrefix().isBlank() ? "/login" : entry.commandPrefix();
        return label + "  " + prefix;
    }
}
