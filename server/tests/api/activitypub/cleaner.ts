/* eslint-disable @typescript-eslint/no-unused-expressions,@typescript-eslint/require-await */

import 'mocha'
import * as chai from 'chai'
import {
  cleanupTests,
  doubleFollow,
  flushAndRunMultipleServers,
  getVideo,
  rateVideo,
  ServerInfo,
  setAccessTokensToServers,
  uploadVideoAndGetId,
  wait,
  waitJobs
} from '@shared/extra-utils'

const expect = chai.expect

describe('Test AP cleaner', function () {
  let servers: ServerInfo[] = []
  let videoUUID1: string
  let videoUUID2: string
  let videoUUID3: string

  let videoUUIDs: string[]

  before(async function () {
    this.timeout(120000)

    const config = {
      federation: {
        videos: { cleanup_remote_interactions: true }
      }
    }
    servers = await flushAndRunMultipleServers(3, config)

    // Get the access tokens
    await setAccessTokensToServers(servers)

    await Promise.all([
      doubleFollow(servers[0], servers[1]),
      doubleFollow(servers[1], servers[2]),
      doubleFollow(servers[0], servers[2])
    ])

    // Update 1 local share, check 6 shares

    // Create 1 comment per video
    // Update 1 remote URL and 1 local URL on

    videoUUID1 = (await uploadVideoAndGetId({ server: servers[0], videoName: 'server 1' })).uuid
    videoUUID2 = (await uploadVideoAndGetId({ server: servers[1], videoName: 'server 2' })).uuid
    videoUUID3 = (await uploadVideoAndGetId({ server: servers[2], videoName: 'server 3' })).uuid

    videoUUIDs = [ videoUUID1, videoUUID2, videoUUID3 ]

    await waitJobs(servers)

    for (const server of servers) {
      for (const uuid of videoUUIDs) {
        await rateVideo(server.url, server.accessToken, uuid, 'like')
        await server.commentsCommand.createThread({ videoId: uuid, text: 'comment' })
      }
    }

    await waitJobs(servers)
  })

  it('Should have the correct likes', async function () {
    for (const server of servers) {
      for (const uuid of videoUUIDs) {
        const res = await getVideo(server.url, uuid)
        expect(res.body.likes).to.equal(3)
        expect(res.body.dislikes).to.equal(0)
      }
    }
  })

  it('Should destroy server 3 internal likes and correctly clean them', async function () {
    this.timeout(20000)

    await servers[2].sqlCommand.deleteAll('accountVideoRate')
    for (const uuid of videoUUIDs) {
      await servers[2].sqlCommand.setVideoField(uuid, 'likes', '0')
    }

    await wait(5000)
    await waitJobs(servers)

    // Updated rates of my video
    {
      const res = await getVideo(servers[0].url, videoUUID1)
      expect(res.body.likes).to.equal(2)
      expect(res.body.dislikes).to.equal(0)
    }

    // Did not update rates of a remote video
    {
      const res = await getVideo(servers[0].url, videoUUID2)
      expect(res.body.likes).to.equal(3)
      expect(res.body.dislikes).to.equal(0)
    }
  })

  it('Should update rates to dislikes', async function () {
    this.timeout(20000)

    for (const server of servers) {
      for (const uuid of videoUUIDs) {
        await rateVideo(server.url, server.accessToken, uuid, 'dislike')
      }
    }

    await waitJobs(servers)

    for (const server of servers) {
      for (const uuid of videoUUIDs) {
        const res = await getVideo(server.url, uuid)
        expect(res.body.likes).to.equal(0)
        expect(res.body.dislikes).to.equal(3)
      }
    }
  })

  it('Should destroy server 3 internal dislikes and correctly clean them', async function () {
    this.timeout(20000)

    await servers[2].sqlCommand.deleteAll('accountVideoRate')

    for (const uuid of videoUUIDs) {
      await servers[2].sqlCommand.setVideoField(uuid, 'dislikes', '0')
    }

    await wait(5000)
    await waitJobs(servers)

    // Updated rates of my video
    {
      const res = await getVideo(servers[0].url, videoUUID1)
      expect(res.body.likes).to.equal(0)
      expect(res.body.dislikes).to.equal(2)
    }

    // Did not update rates of a remote video
    {
      const res = await getVideo(servers[0].url, videoUUID2)
      expect(res.body.likes).to.equal(0)
      expect(res.body.dislikes).to.equal(3)
    }
  })

  it('Should destroy server 3 internal shares and correctly clean them', async function () {
    this.timeout(20000)

    const preCount = await servers[0].sqlCommand.getCount('videoShare')
    expect(preCount).to.equal(6)

    await servers[2].sqlCommand.deleteAll('videoShare')
    await wait(5000)
    await waitJobs(servers)

    // Still 6 because we don't have remote shares on local videos
    const postCount = await servers[0].sqlCommand.getCount('videoShare')
    expect(postCount).to.equal(6)
  })

  it('Should destroy server 3 internal comments and correctly clean them', async function () {
    this.timeout(20000)

    {
      const { total } = await servers[0].commentsCommand.listThreads({ videoId: videoUUID1 })
      expect(total).to.equal(3)
    }

    await servers[2].sqlCommand.deleteAll('videoComment')

    await wait(5000)
    await waitJobs(servers)

    {
      const { total } = await servers[0].commentsCommand.listThreads({ videoId: videoUUID1 })
      expect(total).to.equal(2)
    }
  })

  it('Should correctly update rate URLs', async function () {
    this.timeout(30000)

    async function check (like: string, ofServerUrl: string, urlSuffix: string, remote: 'true' | 'false') {
      const query = `SELECT "videoId", "accountVideoRate".url FROM "accountVideoRate" ` +
        `INNER JOIN video ON "accountVideoRate"."videoId" = video.id AND remote IS ${remote} WHERE "accountVideoRate"."url" LIKE '${like}'`
      const res = await servers[0].sqlCommand.selectQuery(query)

      for (const rate of res) {
        const matcher = new RegExp(`^${ofServerUrl}/accounts/root/dislikes/\\d+${urlSuffix}$`)
        expect(rate.url).to.match(matcher)
      }
    }

    async function checkLocal () {
      const startsWith = 'http://' + servers[0].host + '%'
      // On local videos
      await check(startsWith, servers[0].url, '', 'false')
      // On remote videos
      await check(startsWith, servers[0].url, '', 'true')
    }

    async function checkRemote (suffix: string) {
      const startsWith = 'http://' + servers[1].host + '%'
      // On local videos
      await check(startsWith, servers[1].url, suffix, 'false')
      // On remote videos, we should not update URLs so no suffix
      await check(startsWith, servers[1].url, '', 'true')
    }

    await checkLocal()
    await checkRemote('')

    {
      const query = `UPDATE "accountVideoRate" SET url = url || 'stan'`
      await servers[1].sqlCommand.updateQuery(query)

      await wait(5000)
      await waitJobs(servers)
    }

    await checkLocal()
    await checkRemote('stan')
  })

  it('Should correctly update comment URLs', async function () {
    this.timeout(30000)

    async function check (like: string, ofServerUrl: string, urlSuffix: string, remote: 'true' | 'false') {
      const query = `SELECT "videoId", "videoComment".url, uuid as "videoUUID" FROM "videoComment" ` +
        `INNER JOIN video ON "videoComment"."videoId" = video.id AND remote IS ${remote} WHERE "videoComment"."url" LIKE '${like}'`

      const res = await servers[0].sqlCommand.selectQuery(query)

      for (const comment of res) {
        const matcher = new RegExp(`${ofServerUrl}/videos/watch/${comment.videoUUID}/comments/\\d+${urlSuffix}`)
        expect(comment.url).to.match(matcher)
      }
    }

    async function checkLocal () {
      const startsWith = 'http://' + servers[0].host + '%'
      // On local videos
      await check(startsWith, servers[0].url, '', 'false')
      // On remote videos
      await check(startsWith, servers[0].url, '', 'true')
    }

    async function checkRemote (suffix: string) {
      const startsWith = 'http://' + servers[1].host + '%'
      // On local videos
      await check(startsWith, servers[1].url, suffix, 'false')
      // On remote videos, we should not update URLs so no suffix
      await check(startsWith, servers[1].url, '', 'true')
    }

    {
      const query = `UPDATE "videoComment" SET url = url || 'kyle'`
      await servers[1].sqlCommand.updateQuery(query)

      await wait(5000)
      await waitJobs(servers)
    }

    await checkLocal()
    await checkRemote('kyle')
  })

  after(async function () {
    await cleanupTests(servers)
  })
})
