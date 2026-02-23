# Hook Event Table

All unique stdin JSON combinations from `~/.code-pet/hooks-debug.log` and the pet event each triggers.

| hook_event_name  | permission_mode | tool_name | notification_type | message                                      | triggers_event   | state              | auto_transition          |
|------------------|-----------------|-----------|-------------------|----------------------------------------------|------------------|--------------------|--------------------------|
| SessionStart     | —               | —         | —                 | —                                            | awaken           | waking_up          | → idle (800ms)           |
| SessionEnd       | —               | —         | —                 | —                                            | falling_asleep   | going_to_sleep     | —                        |
| UserPromptSubmit | plan            | —         | —                 | —                                            | planning_started | planning           | —                        |
| UserPromptSubmit | !plan           | —         | —                 | —                                            | working_started  | working            | —                        |
| Notification     | —               | —         | permission_prompt | Claude Code needs your attention             | action_requested | waiting_for_action | —                        |
| Notification     | —               | —         | permission_prompt | Claude Code needs your approval for the plan | action_requested | waiting_for_action | —                        |
| Stop             | any             | —         | —                 | —                                            | work_finished    | idle               | —                        |
