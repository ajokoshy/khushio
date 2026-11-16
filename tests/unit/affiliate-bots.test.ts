import { describe, expect, it } from "vitest";
import { countryOf, isBotUserAgent, referrerHostOf } from "@/modules/affiliate/bots";

describe("bot filtering", () => {
  it.each([
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0.0.0",
  ])("keeps real browsers: %s", (ua) => expect(isBotUserAgent(ua)).toBe(false));

  it.each([
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.24.10.80 A",
    "curl/8.4.0",
    "python-requests/2.31.0",
    "Go-http-client/2.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse",
    "UptimeRobot/2.0",
    "KhushioLinkCheck/1.0 preview",
  ])("flags %s", (ua) => expect(isBotUserAgent(ua)).toBe(true));

  it("treats a missing, empty or very short agent as a bot", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla")).toBe(true);
  });
});

describe("click details", () => {
  it("keeps only the host of the referrer", () => {
    expect(referrerHostOf("https://www.Google.com/search?q=secret&x=1")).toBe("www.google.com");
    expect(referrerHostOf("http://t.co/abc")).toBe("t.co");
    expect(referrerHostOf("android-app://com.google.android.gm")).toBeNull();
    expect(referrerHostOf("not a url")).toBeNull();
    expect(referrerHostOf(null)).toBeNull();
  });

  it("accepts only a two-letter country code", () => {
    expect(countryOf("in")).toBe("IN");
    expect(countryOf("IN")).toBe("IN");
    expect(countryOf("India")).toBeNull();
    expect(countryOf("")).toBeNull();
    expect(countryOf(null)).toBeNull();
  });
});
