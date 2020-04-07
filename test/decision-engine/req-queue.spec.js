/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const PeerId = require('peer-id')
const promisify = require('promisify-es6')

const RequestQueue = require('../../src/decision-engine/req-queue')

describe('Request Queue', () => {
  let peerIds

  before(async () => {
    peerIds = await Promise.all([
      promisify(PeerId.create)({ bits: 512 }),
      promisify(PeerId.create)({ bits: 512 }),
      promisify(PeerId.create)({ bits: 512 })
    ])
  })

  describe('push / pop', () => {
    it('pop empty queue returns no tasks', () => {
      const rq = new RequestQueue()
      const { peerId, tasks, pendingSize } = rq.popTasks(1)
      expect(peerId).to.be.undefined()
      expect(tasks.length).to.eql(0)
      expect(pendingSize).to.eql(0)
    })

    it('pops correct number of tasks', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 10,
        priority: 3
      }, {
        topic: 'b',
        size: 5,
        priority: 2
      }, {
        topic: 'c',
        size: 5,
        priority: 1
      }])

      const { peerId, tasks, pendingSize } = rq.popTasks(11)
      expect(peerId).to.eql(peerIds[0])
      expect(tasks.map(t => t.topic)).to.eql(['a', 'b'])
      expect(pendingSize).to.eql(5)

      const res = rq.popTasks(1)
      expect(res.tasks.length).to.eql(1)
      expect(res.pendingSize).to.eql(0)
    })

    it('pops nothing for zero targetMinSize', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 2
      }, {
        topic: 'b',
        size: 1,
        priority: 1
      }])

      const { tasks, pendingSize } = rq.popTasks(0)
      expect(tasks.length).to.eql(0)
      expect(pendingSize).to.eql(2)
    })

    it('pops no tasks for empty peer', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 1
      }])

      const res = rq.popTasks(1)
      expect(res.tasks.length).to.eql(1)
      expect(res.pendingSize).to.eql(0)

      const res2 = rq.popTasks(1)
      expect(res2.tasks.length).to.eql(0)
      expect(res2.pendingSize).to.eql(0)
    })

    it('pops tasks in priority order', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 10
      }, {
        topic: 'b',
        size: 1,
        priority: 5
      }, {
        topic: 'c',
        size: 1,
        priority: 7
      }])

      const { peerId, tasks, pendingSize } = rq.popTasks(10)
      expect(peerId).to.eql(peerIds[0])
      expect(pendingSize).to.eql(0)
      expect(tasks.map(t => t.topic)).to.eql(['a', 'c', 'b'])
    })

    it('can push more tasks after exhausting tasks for peer', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 1
      }])

      // Pop all tasks for peer0
      let { tasks } = rq.popTasks(10)
      expect(tasks.length).eql(1)

      // Push some more tasks for peer0
      rq.pushTasks(peerIds[0], [{
        topic: 'b',
        size: 1,
        priority: 1
      }])

      // Pop tasks for peer0
      tasks = rq.popTasks(10).tasks
      expect(tasks.length).eql(1)
    })

    it('pops peers in order of active size increasing, then pending tasks decreasing', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 5,
        priority: 1
      }])
      rq.pushTasks(peerIds[1], [{
        topic: 'b',
        size: 10,
        priority: 3
      }, {
        topic: 'c',
        size: 3,
        priority: 2
      }, {
        topic: 'd',
        size: 1,
        priority: 1
      }])
      rq.pushTasks(peerIds[2], [{
        topic: 'e',
        size: 7,
        priority: 2
      }, {
        topic: 'f',
        size: 2,
        priority: 1
      }])

      //          Active   Pending
      // peer0:            5
      // peer1:            10, 3, 1
      // peer2:            7. 2

      // No active tasks and peer1 has most pending tasks so expect peer1
      let { peerId } = rq.popTasks(1)
      expect(peerId).to.eql(peerIds[1])

      //          Active   Pending
      // peer0:            5
      // peer1:   10       3, 1
      // peer2:            7. 2

      // peer0 and peer2 have least active size and peer2 has more pending
      // tasks so expect peer2
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[2])

      //          Active   Pending
      // peer0:            5
      // peer1:   10       3, 1
      // peer2:   7        2

      // peer0 has least active size so expect peer0
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[0])

      //          Active   Pending
      // peer0:   5
      // peer1:   10       3, 1
      // peer2:   7        2

      // peer0 has least active size but no pending tasks.
      // peer2 has smaller active size than peer 1 so expect peer2
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[2])

      //          Active   Pending
      // peer0:   5
      // peer1:   10       3, 1
      // peer2:   7, 2

      // peer1 is only peer with pending tasks so expect peer1
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[1])

      //          Active   Pending
      // peer0:   5
      // peer1:   10, 3    1
      // peer2:   7, 2

      // peer1 is only peer with pending tasks so expect peer1
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[1])

      //          Active   Pending
      // peer0:   5
      // peer1:   10, 3, 1
      // peer2:   7, 2

      // peer1 is only peer with pending tasks so expect peer1
      peerId = rq.popTasks(1).peerId
      expect(peerId).to.be.undefined()
    })
  })

  describe('remove', () => {
    it('removes tasks by peer and topic', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 2
      }, {
        topic: 'b',
        size: 1,
        priority: 1
      }])

      rq.pushTasks(peerIds[1], [{
        topic: 'a',
        size: 1,
        priority: 3
      }, {
        topic: 'b',
        size: 1,
        priority: 2
      }, {
        topic: 'c',
        size: 1,
        priority: 1
      }])

      rq.remove('a', peerIds[0])
      rq.remove('b', peerIds[1])

      const res = rq.popTasks(10)
      expect(res.peerId).to.eql(peerIds[1])
      expect(res.tasks.length).to.eql(2)
      expect(res.tasks.map(t => t.topic)).to.eql(['a', 'c'])

      const res2 = rq.popTasks(10)
      expect(res2.peerId).to.eql(peerIds[0])
      expect(res2.tasks.length).to.eql(1)
      expect(res2.tasks.map(t => t.topic)).to.eql(['b'])
    })

    it('ignores remove non-existent peer', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 2
      }])

      rq.remove('a', peerIds[1])

      const res = rq.popTasks(10)
      expect(res.tasks.length).to.eql(1)
    })

    it('ignores remove non-existent topic', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 2
      }])

      rq.remove('b', peerIds[0])

      const res = rq.popTasks(10)
      expect(res.tasks.length).to.eql(1)
    })
  })

  describe('update tasks', () => {
    it('updates priority of existing pending tasks', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 1,
        priority: 2
      }, {
        topic: 'b',
        size: 1,
        priority: 1
      }])

      rq.pushTasks(peerIds[0], [{
        topic: 'b',
        size: 1,
        priority: 3
      }])

      const { tasks } = rq.popTasks(10)
      expect(tasks.map(t => t.topic)).to.eql(['b', 'a'])
    })

    it('taskDone removes active task', () => {
      const rq = new RequestQueue()

      rq.pushTasks(peerIds[0], [{
        topic: 'a',
        size: 2,
        priority: 2
      }, {
        topic: 'b',
        size: 1,
        priority: 1
      }])

      rq.pushTasks(peerIds[1], [{
        topic: 'c',
        size: 1,
        priority: 3
      }, {
        topic: 'd',
        size: 1,
        priority: 2
      }])

      // Pop one task for each peer
      const res1 = rq.popTasks(1)
      const res2 = rq.popTasks(1)

      //          Active       Pending
      // peer0:   a (size 2)   b
      // peer1:   c (size 1)   d, e

      // Mark peer0's task as done
      for (const res of [res1, res2]) {
        if (res.peerId === peerIds[0]) {
          rq.tasksDone(peerIds[0], res.tasks)
        }
      }

      //          Active       Pending
      // peer0:     (size 0)   b
      // peer1:   c (size 1)   d, e

      // peer0 has less active data (zero bytes) so the next pop should come
      // from peer0's tasks
      const peerId = rq.popTasks(1).peerId
      expect(peerId).to.eql(peerIds[0])
    })
  })
})
