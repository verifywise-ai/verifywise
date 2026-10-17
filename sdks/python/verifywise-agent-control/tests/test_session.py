import asyncio

from verifywise_agent_control import current_session_id, vw_session


def test_no_session_by_default():
    assert current_session_id() is None


def test_vw_session_sets_and_restores():
    with vw_session("outer") as outer:
        assert outer == "outer"
        assert current_session_id() == "outer"
        with vw_session() as inner:
            assert inner and inner != "outer"
            assert current_session_id() == inner
        assert current_session_id() == "outer"
    assert current_session_id() is None


def test_vw_session_restores_after_an_exception():
    try:
        with vw_session("boom"):
            raise RuntimeError
    except RuntimeError:
        pass
    assert current_session_id() is None


async def test_sessions_are_isolated_between_tasks():
    seen = {}

    async def worker(name):
        with vw_session(name):
            await asyncio.sleep(0)
            seen[name] = current_session_id()

    await asyncio.gather(worker("a"), worker("b"))
    assert seen == {"a": "a", "b": "b"}
