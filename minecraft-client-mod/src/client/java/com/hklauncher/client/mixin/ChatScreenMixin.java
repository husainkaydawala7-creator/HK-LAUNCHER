package com.hklauncher.client.mixin;

import com.hklauncher.client.HkLoginScreen;
import net.minecraft.client.gui.screen.ChatScreen;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ChatScreen.class)
public abstract class ChatScreenMixin extends Screen {
    protected ChatScreenMixin(Text title) {
        super(title);
    }

    @Inject(method = "init", at = @At("TAIL"))
    private void hk$addLoginButton(CallbackInfo ci) {
        addDrawableChild(ButtonWidget.builder(Text.literal("HK Login"), button -> client.setScreen(new HkLoginScreen(this)))
                .dimensions(width - 96, height - 24, 88, 20)
                .build());
    }
}
