package com.hklauncher.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

public final class HkBridgeClient {
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
    private final int port;
    private final String token;

    public HkBridgeClient() {
        this.port = parsePort(System.getProperty("hk.bridge.port", "0"));
        this.token = System.getProperty("hk.bridge.token", "");
    }

    public boolean isAvailable() {
        return port > 0 && !token.isBlank();
    }

    public List<LoginEntry> listLogins() throws IOException, InterruptedException {
        JsonObject json = requestJson("/logins");
        JsonArray logins = json.getAsJsonArray("logins");
        List<LoginEntry> entries = new ArrayList<>();
        if (logins == null) return entries;

        for (int index = 0; index < logins.size(); index += 1) {
            JsonObject login = logins.get(index).getAsJsonObject();
            entries.add(new LoginEntry(
                    stringValue(login, "id"),
                    stringValue(login, "label"),
                    stringValue(login, "serverAddress"),
                    stringValue(login, "commandPrefix")
            ));
        }
        return entries;
    }

    public String commandFor(String id) throws IOException, InterruptedException {
        JsonObject json = requestJson("/command?id=" + URLEncoder.encode(id, StandardCharsets.UTF_8));
        return stringValue(json, "command");
    }

    private JsonObject requestJson(String path) throws IOException, InterruptedException {
        if (!isAvailable()) throw new IOException("HK Launcher bridge is unavailable.");
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + path))
                .header("X-HK-Token", token)
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        JsonObject json = JsonParser.parseString(response.body()).getAsJsonObject();
        if (response.statusCode() >= 400) {
            throw new IOException(stringValue(json, "error"));
        }
        return json;
    }

    private static int parsePort(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static String stringValue(JsonObject object, String key) {
        return object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsString() : "";
    }

    public record LoginEntry(String id, String label, String serverAddress, String commandPrefix) {
    }
}
