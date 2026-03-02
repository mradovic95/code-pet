# Hook Event Table

All unique stdin JSON combinations from `~/.code-pet/hooks-debug.log` and the pet event each triggers.

| hook_event_name  | permission_mode | tool_name | notification_type | message                                      | triggers_event   | state              | auto_transition          | notes                                   |
|------------------|-----------------|-----------|-------------------|----------------------------------------------|------------------|--------------------|--------------------------|------------------------------------------|
| SessionStart     | —               | —         | —                 | —                                            | awaken           | waking_up          | → idle (4000ms, renderer-only) | renderer-only animation; server stays in idle. Ignored in non-idle states (whitelist pattern) |
| SessionEnd       | —               | —         | —                 | —                                            | falling_asleep   | (special handling) | —                        | restores from waiting_for_action if prior active state; removes project in all other states |
| UserPromptSubmit | plan            | —         | —                 | —                                            | planning_started | planning           | —                        |                                          |
| UserPromptSubmit | !plan           | —         | —                 | —                                            | working_started  | working            | —                        |                                          |
| Notification     | —               | —         | permission_prompt | Claude Code needs your attention             | action_requested | waiting_for_action | —                        |                                          |
| Notification     | —               | —         | permission_prompt | Claude Code needs your approval for the plan | action_requested | waiting_for_action | —                        |                                          |
| PostToolUse      | —               | (any tool)      | —           | —                                            | action_completed  | (restores previous) | —                       | server restores working/planning via lastActiveEvent; re-affirms in active states; ignored in idle |
| Stop             | any             | —         | —                 | —                                            | work_finished    | idle               | —                        |                                          |
