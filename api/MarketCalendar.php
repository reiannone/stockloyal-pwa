<?php
/**
 * MarketCalendar.php
 * 
 * Checks Alpaca's /v1/calendar endpoint to determine market open/close status,
 * next trading day, and provides human-readable messaging for members.
 * 
 * Usage:
 *   $calendar = new MarketCalendar();
 *   $status = $calendar->getMarketStatus();
 *   // $status['is_open'], $status['next_trading_day'], $status['message'], etc.
 */

class MarketCalendar
{
    private string $baseUrl;
    private string $apiKey;
    private string $apiSecret;
    private string $timezone = 'America/New_York';

    // Cache calendar data for the day to avoid repeated API calls
    private static ?array $calendarCache = null;
    private static ?string $cacheDateKey = null;

    public function __construct()
    {
        $this->baseUrl  = rtrim(getenv('ALPACA_BASE_URL') ?: ALPACA_BASE_URL, '/');
        $this->apiKey   = getenv('ALPACA_API_KEY') ?: ALPACA_API_KEY;
        $this->apiSecret = getenv('ALPACA_API_SECRET') ?: ALPACA_API_SECRET;
    }

    // ─── Public API ────────────────────────────────────────────────

    /**
     * Get comprehensive market status for right now.
     * 
     * Returns:
     *   is_open          bool    - Is the market currently in regular trading hours?
     *   is_extended       bool    - Is extended-hours trading active?
     *   is_trading_day    bool    - Is today a trading day at all?
     *   next_trading_day  string  - Next trading day (YYYY-MM-DD), could be today if market hasn't opened yet
     *   next_open_time    string  - ISO 8601 datetime of next market open
     *   next_close_time   string  - ISO 8601 datetime of next market close
     *   message           string  - Human-readable status message for member UI
     *   message_short     string  - Brief version for banners/toasts
     *   delay_reason      string  - 'weekend' | 'holiday' | 'after_hours' | 'pre_market' | null
     */
    public function getMarketStatus(): array
    {
        $now = new DateTimeImmutable('now', new DateTimeZone($this->timezone));
        $today = $now->format('Y-m-d');

        // Fetch calendar for a window around today
        $calendar = $this->fetchCalendarRange(
            $now->modify('-1 day')->format('Y-m-d'),
            $now->modify('+7 days')->format('Y-m-d')
        );

        // Find today's entry (if it exists, today is a trading day)
        $todayEntry = $this->findCalendarEntry($calendar, $today);
        $isTradingDay = $todayEntry !== null;

        // Find the next trading day (today or future)
        $nextTradingDay = $this->findNextTradingDay($calendar, $today, $now);

        // Determine if market is currently open
        $isOpen = false;
        $isExtended = false;

        if ($isTradingDay && $todayEntry) {
            $openTime  = new DateTimeImmutable($today . ' ' . $todayEntry['open'], new DateTimeZone($this->timezone));
            $closeTime = new DateTimeImmutable($today . ' ' . $todayEntry['close'], new DateTimeZone($this->timezone));

            // Regular hours: typically 9:30 AM - 4:00 PM ET
            $isOpen = ($now >= $openTime && $now < $closeTime);

            // Extended hours: 4:00 AM - 8:00 PM ET (pre-market + after-hours)
            $extendedOpen  = new DateTimeImmutable($today . ' 04:00', new DateTimeZone($this->timezone));
            $extendedClose = new DateTimeImmutable($today . ' 20:00', new DateTimeZone($this->timezone));
            $isExtended = !$isOpen && ($now >= $extendedOpen && $now < $extendedClose);
        }

        // Build messaging
        $delayReason = $this->getDelayReason($now, $isTradingDay, $isOpen, $isExtended);
        $message = $this->buildMemberMessage($nextTradingDay, $delayReason, $isOpen);
        $messageShort = $this->buildShortMessage($nextTradingDay, $delayReason, $isOpen);

        // Next open/close times
        $nextOpenTime = null;
        $nextCloseTime = null;
        if ($nextTradingDay) {
            $nextEntry = $this->findCalendarEntry($calendar, $nextTradingDay['date']);
            if ($nextEntry) {
                $nextOpenTime  = $nextTradingDay['date'] . 'T' . $nextEntry['open'] . ':00-05:00';
                $nextCloseTime = $nextTradingDay['date'] . 'T' . $nextEntry['close'] . ':00-05:00';
            }
        }

        return [
            'is_open'           => $isOpen,
            'is_extended'       => $isExtended,
            'is_trading_day'    => $isTradingDay,
            'next_trading_day'  => $nextTradingDay['date'] ?? null,
            'next_open_time'    => $nextOpenTime,
            'next_close_time'   => $nextCloseTime,
            'message'           => $message,
            'message_short'     => $messageShort,
            'delay_reason'      => $delayReason,
            'checked_at'        => $now->format('c'),
        ];
    }

    /**
     * Get the next trading day from a given date (exclusive — does NOT include $fromDate).
     * Useful for scheduling: "when is the next day the market is open after today?"
     */
    public function getNextTradingDayAfter(string $fromDate): ?string
    {
        $from = new DateTimeImmutable($fromDate, new DateTimeZone($this->timezone));
        $calendar = $this->fetchCalendarRange(
            $from->modify('+1 day')->format('Y-m-d'),
            $from->modify('+10 days')->format('Y-m-d')
        );

        foreach ($calendar as $entry) {
            if ($entry['date'] > $fromDate) {
                return $entry['date'];
            }
        }

        return null;
    }

    /**
     * Check if a given date is a trading day.
     */
    public function isTradingDay(string $date): bool
    {
        $calendar = $this->fetchCalendarRange($date, $date);
        return !empty($calendar) && $calendar[0]['date'] === $date;
    }

    /**
     * Get the scheduled execution date for an order placed right now.
     * If market is open → today. Otherwise → next trading day.
     */
    public function getScheduledExecutionDate(): string
    {
        $status = $this->getMarketStatus();

        if ($status['is_open']) {
            return (new DateTimeImmutable('now', new DateTimeZone($this->timezone)))->format('Y-m-d');
        }

        return $status['next_trading_day'];
    }

    // ─── Alpaca API ────────────────────────────────────────────────

    /**
     * Fetch market calendar from Alpaca for a date range.
     * Results are cached per request cycle.
     */
    private function fetchCalendarRange(string $start, string $end): array
    {
        $cacheKey = "{$start}_{$end}";

        if (self::$cacheDateKey === $cacheKey && self::$calendarCache !== null) {
            return self::$calendarCache;
        }

        $url = "{$this->baseUrl}/v1/calendar?start={$start}&end={$end}";

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Basic ' . base64_encode("{$this->apiKey}:{$this->apiSecret}"),
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT => 10,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || $response === false) {
            error_log("MarketCalendar: Failed to fetch calendar (HTTP {$httpCode})");
            // Fallback: assume standard M-F schedule
            return $this->generateFallbackCalendar($start, $end);
        }

        $data = json_decode($response, true);

        if (!is_array($data)) {
            error_log("MarketCalendar: Invalid calendar response");
            return $this->generateFallbackCalendar($start, $end);
        }

        self::$cacheDateKey = $cacheKey;
        self::$calendarCache = $data;

        return $data;
    }

    // ─── Helpers ───────────────────────────────────────────────────

    private function findCalendarEntry(array $calendar, string $date): ?array
    {
        foreach ($calendar as $entry) {
            if ($entry['date'] === $date) {
                return $entry;
            }
        }
        return null;
    }

    private function findNextTradingDay(array $calendar, string $today, DateTimeImmutable $now): ?array
    {
        // If today is a trading day and market hasn't closed yet, today counts
        $todayEntry = $this->findCalendarEntry($calendar, $today);
        if ($todayEntry) {
            $closeTime = new DateTimeImmutable($today . ' ' . $todayEntry['close'], new DateTimeZone($this->timezone));
            if ($now < $closeTime) {
                return $todayEntry;
            }
        }

        // Otherwise find the next future trading day
        foreach ($calendar as $entry) {
            if ($entry['date'] > $today) {
                return $entry;
            }
        }

        return null;
    }

    private function getDelayReason(
        DateTimeImmutable $now,
        bool $isTradingDay,
        bool $isOpen,
        bool $isExtended
    ): ?string {
        if ($isOpen) {
            return null; // No delay
        }

        $dayOfWeek = (int) $now->format('N'); // 1=Mon, 7=Sun

        if ($dayOfWeek >= 6) {
            return 'weekend';
        }

        if (!$isTradingDay) {
            return 'holiday';
        }

        $hour = (int) $now->format('G');

        if ($hour < 9 || ($hour === 9 && (int) $now->format('i') < 30)) {
            return 'pre_market';
        }

        return 'after_hours';
    }

    private function buildMemberMessage(?array $nextTradingDay, ?string $delayReason, bool $isOpen): string
    {
        if ($isOpen) {
            return 'The market is open. Your order will be processed shortly.';
        }

        $nextDate = $nextTradingDay['date'] ?? null;
        $dayLabel = $nextDate ? $this->formatFriendlyDate($nextDate) : 'the next trading day';

        switch ($delayReason) {
            case 'weekend':
                return "The market is closed for the weekend. Your order has been received and will be executed when trading opens on {$dayLabel}.";

            case 'holiday':
                return "The market is closed today for a holiday. Your order has been received and will be executed when trading resumes on {$dayLabel}.";

            case 'after_hours':
                return "The market has closed for today. Your order has been received and will be executed when trading opens on {$dayLabel}.";

            case 'pre_market':
                return "The market hasn't opened yet today. Your order has been received and will be executed when trading begins at 9:30 AM ET.";

            default:
                return "Your order has been received and will be executed on {$dayLabel}.";
        }
    }

    private function buildShortMessage(?array $nextTradingDay, ?string $delayReason, bool $isOpen): string
    {
        if ($isOpen) {
            return 'Market open — processing now';
        }

        $nextDate = $nextTradingDay['date'] ?? null;
        $dayLabel = $nextDate ? $this->formatFriendlyDate($nextDate) : 'next trading day';

        return "Market closed — executes {$dayLabel}";
    }

    private function formatFriendlyDate(string $date): string
    {
        $target = new DateTimeImmutable($date, new DateTimeZone($this->timezone));
        $now    = new DateTimeImmutable('now', new DateTimeZone($this->timezone));

        $today    = $now->format('Y-m-d');
        $tomorrow = $now->modify('+1 day')->format('Y-m-d');

        if ($date === $today) {
            return 'today';
        }

        if ($date === $tomorrow) {
            return 'tomorrow';
        }

        // "Monday, Jan 6" format
        return $target->format('l, M j');
    }

    /**
     * Fallback calendar if API is unreachable.
     * Generates a basic M-F schedule (won't know about holidays).
     */
    private function generateFallbackCalendar(string $start, string $end): array
    {
        $calendar = [];
        $current = new DateTimeImmutable($start, new DateTimeZone($this->timezone));
        $endDate = new DateTimeImmutable($end, new DateTimeZone($this->timezone));

        while ($current <= $endDate) {
            $dayOfWeek = (int) $current->format('N');
            if ($dayOfWeek <= 5) { // Mon-Fri
                $calendar[] = [
                    'date'  => $current->format('Y-m-d'),
                    'open'  => '09:30',
                    'close' => '16:00',
                ];
            }
            $current = $current->modify('+1 day');
        }

        return $calendar;
    }
}
