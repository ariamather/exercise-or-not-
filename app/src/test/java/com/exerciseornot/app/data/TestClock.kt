package com.exerciseornot.app.data

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/** Controllable clock: every read advances 1 ms so rows written in sequence get distinct timestamps. */
class TestClock(
    private var now: Instant = Instant.parse("2026-11-10T04:00:00Z"),
    private val zone: ZoneId = ZoneId.of("Asia/Shanghai"),
) : Clock() {
    fun advance(duration: Duration) { now = now.plus(duration) }
    fun set(instant: Instant) { now = instant }
    override fun getZone(): ZoneId = zone
    override fun withZone(zone: ZoneId): Clock = TestClock(now, zone)
    override fun instant(): Instant = now.also { now = now.plusMillis(1) }
}
