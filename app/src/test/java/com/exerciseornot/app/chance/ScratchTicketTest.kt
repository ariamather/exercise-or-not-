package com.exerciseornot.app.chance

import kotlin.random.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ScratchTicketTest {
    @Test fun everyProbabilityStopUsesExactlyItsShareOfTickets() {
        assertEquals("scratch", ScratchTicket.id)
        assertEquals((1..10).map(Int::toString), ScratchTicket.outcomes.map(Outcome::id))
        assertEquals((0..10).map { "$it/10" }, ScratchTicket.stops.map(Stop::key))
        for ((k, stop) in ScratchTicket.stops.withIndex()) {
            assertEquals(k * 10, stop.percent)
            assertEquals(k to 10, ScratchTicket.trainWeight(stop))
            assertEquals(
                ((11 - k)..10).map(Int::toString),
                ScratchTicket.outcomes.filter { ScratchTicket.trains(stop, it.id) }.map(Outcome::id),
            )
        }
        assertFalse(ScratchTicket.trains(ScratchTicket.stops.last(), "11"))
    }

    @Test fun theSameRandomTicketWorksAtEveryStop() {
        for (stop in ScratchTicket.stops) {
            val draw = ScratchTicket.draw(stop, Random(3))
            assertEquals(ScratchTicket.draw(ScratchTicket.stops.first(), Random(3)).outcomeId, draw.outcomeId)
            assertEquals(ScratchTicket.trains(stop, draw.outcomeId), draw.train)
        }
    }
}
