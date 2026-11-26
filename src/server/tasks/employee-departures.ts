import { defineTask } from 'nitro/task'
import { runScheduledDepartures } from '#/features/access/server/access.service.server'

export default defineTask({
  async run() {
    try {
      return { result: await runScheduledDepartures() }
    } catch {
      throw new Error('Scheduled employee departure task failed')
    }
  },
})
