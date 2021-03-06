'use strict'
const co = require('co')
module.exports = app => {
  class PagesController extends app.Controller {

    /**
     * 记录页面pv
     */
    * pv () {
      const {
        ctx
      } = this
      var obj = ctx.request.body
      obj.pageKey = 'key_' + obj.pageKey
      this.ctx.helper.tools.TSDB.putMetric(
        'h5.page.maliang.pv' + obj.pageKey,
        new Date().getTime(),
        1, { uuid: obj.uuid }
      )
    }

    * pvuv () {
      const {
        ctx
      } = this
      var obj = ctx.request.body
      obj.pageKey = 'key_' + obj.pageKey

      var myTsdbClient = this.ctx.helper.tools.TSDB

      var getUv = function (array) {
        var dps = {}
        for (let index = 0; index < array.length; index++) {
          let element = array[ index ];
          for (const key in element.dps) {
            if (dps[ key ]) {
              dps[ key ] += 1
            } else {
              dps[ key ] = 1
            }
          }
        }
        return dps
      }
      console.log('获取pv' + obj.pageKey)
      let pv = yield myTsdbClient.query(
        obj.startTime,
        obj.endTime, [ {
          "aggregator": "sum",
          "metric": "h5.page.maliang.pv" + obj.pageKey,
          filters: [],
          downsample: myTsdbClient.composeDownsampleString('sum', obj.step)
        } ]
      )
      console.log('获取pv完成')
      if (pv.error || !pv[ 0 ]) {
        pv = {}
      } else {
        pv = pv[ 0 ].dps
      }
      console.log('获取uv' + obj.pageKey)
      // let uv = yield myTsdbClient.query(
      //   obj.startTime,
      //   obj.endTime, [ {
      //     "aggregator": "sum",
      //     "metric": "h5.page.maliang.pv" + obj.pageKey,
      //     filters: [ {
      //       "type": "wildcard",
      //       "tagk": "uuid",
      //       "filter": "*",
      //       "groupBy": true
      //     } ],
      //     downsample: myTsdbClient.composeDownsampleString('sum', obj.step)
      //   } ]
      // )
      // if (uv.error) {
      //   uv = {}
      // } else {
      //   uv = getUv(uv)
      // }
      ctx.body = { pv: pv, uv: {} }
    }

    * save () {
      const {
        ctx
      } = this
      const searchRule = {
        name: {
          type: 'string',
          max: 50,
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(searchRule)
      console.log('validate success')
      var obj = ctx.request.body
      delete obj.updateTime
      delete obj.createTime

      if (obj.id) {
        const role = yield ctx.service.base.getUserRole(ctx.request.uid, obj.projectId)
        var permissionLimit = this.app.config.permissionLimit[obj.type] || {}
        if (permissionLimit.save && !(role <= permissionLimit.save)) throw this.ctx.getError({msg: '您缺少“开发者”或更高权限，无法保存，请联系该页面管理人员添加权限'})
      }

      ctx.body = yield ctx.service.pages.save(obj)
    }

    * list () {
      const {
        ctx
      } = this
      const searchRule = {
        projectId: {
          type: 'int',
          required: true,
          allowEmpty: false
        },
        status: {
          type: 'int',
          required: false,
          allowEmpty: true
        }
      }
      ctx.validate(searchRule)
      const query = ctx.request.body;
      query.uid = ctx.request.uid;
      ctx.body = yield ctx.service.pages.list(query)
    }

    * publiclist () {
      const {
        ctx
      } = this
      const searchRule = {}
      ctx.validate(searchRule)
      ctx.body = yield ctx.service.pages.publiclist(ctx.request.body)
    }

    * info () {
      const {
        ctx
      } = this
      const createRule = {
        id: {
          type: 'string',
          required: true
        }
      }
      ctx.validate(createRule)
      var body = ctx.request.body
      body.uid = ctx.request.uid;
      var info = yield ctx.service.pages.info(body)
      ctx.body = info
    }

    async detail () {
      const {
        ctx
      } = this
      const createRule = {
        pageKey: {
          type: 'string',
          required: true
        },
        scene: {
          type: 'string',
          required: false,
        }
      }
      ctx.validate(createRule)
      var body = ctx.request.body
      var retval
      var fromCache
      var role

      switch (body.scene) {
        case 'render':
          retval = await this.ctx.app.getCache(body.pageKey) // string
          fromCache = !ctx.helper.tools.isEmpty(retval) && !ctx.helper.tools.isEmptyObject(retval)
          if (fromCache) break
        case 'preview':
        case 'copy':
        case 'edit':
        case 'history':
        case 'history_preview':
          retval = await co(function * () {
            return yield ctx.service.pages.detail(ctx.request.body)
          })
          if (['render', 'preview', 'history_preview'].includes(body.scene)) {
            retval.content = ctx.helper.tools.nodeTreeScriptTransform(retval.content)
          }
          if (body.scene == 'edit') {
            role = await co(function * () {
              return yield ctx.service.base.getUserRole(ctx.request.uid, retval.projectId)
            })
            if (role >= 4) throw ctx.getError({ status: 403, msg: '您没有此页面的权限' })
          }
          if (body.scene == 'render') {
            this.ctx.app.setCache(body.pageKey, retval)
          }
      }
      
      if (fromCache) {
        ctx.noWarp = 1
        ctx.body = `{"code":1,"msg":"success","data":${retval}}`
        console.info(`从缓存中获取详情 ${body.scene}`)
      } else {
        ctx.body = retval
        console.info(`从数据库中获取详情 ${body.scene}`)
      }
    }

    * changeStatus () {
      const {
        ctx
      } = this
      const searchRule = {
        id: {
          type: 'int',
          required: true,
          allowEmpty: false
        },
        status: {
          type: 'int',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(searchRule)
      console.log('validate success')
      ctx.body = yield ctx.service.pages.changeStatus(ctx.request.body)
    }

    * setHomePage () {
      const {
        ctx
      } = this
      const searchRule = {
        id: {
          type: 'int',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(searchRule)
      console.log('validate success')
      ctx.body = yield ctx.service.pages.setHomePage(ctx.request.body)
    }

    * delete () {
      const {
        ctx
      } = this
      const createRule = {
        id: {
          type: 'int',
          required: true
        }
      }
      ctx.validate(createRule)
      const query = {
        id: ctx.request.body.id,
        uid: ctx.request.uid
      }
      yield ctx.service.pages.delete(query)
    }

    * publish () {
      const {
        ctx
      } = this
      const createRule = {
        id: {
          type: 'int',
          required: true
        },
        projectId: {
          type: 'int',
          required: true
        },
        pageKey: {
          type: 'string',
          required: true
        },
        content: {
          type: 'string',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(createRule)
      var body = ctx.request.body
      body.uid = ctx.request.uid;

      const role = yield ctx.service.base.getUserRole(ctx.request.uid, body.projectId)
      var permissionLimit = this.app.config.permissionLimit[body.type] || {}
      if (permissionLimit.publish && !(role <= permissionLimit.publish)) throw this.ctx.getError({msg: '您缺少“管理员”或更高权限，无法发布，请联系该页面管理人员'})

      yield ctx.service.pages.publish(body)
      this.ctx.app.delCache(body.pageKey) // 更新缓存 实际是清除缓存，待下次请求自动进行缓存
    }

    * count () {
      const {
        ctx
      } = this
      var num = yield ctx.service.pages.count()
      ctx.body = {
        count: num
      }
    }

    * history () {
      const {
        ctx
      } = this
      const searchRule = {
        pageId: {
          type: 'string',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(searchRule, ctx.query)
      var body = ctx.query
      body.uid = ctx.request.uid
      ctx.body = yield ctx.service.pages.history(body)
    }

    * getNameBykeys () {
      const {
        ctx
      } = this
      let rule = {
        ids: {
          type: 'array',
          itemType: 'string',
        }
      }
      ctx.validate(rule)
      let names = yield ctx.service.pages.getNameBykeys(ctx.request.body)
      ctx.body = { names }
    }
    * historyDelete () {
      const {
        ctx
      } = this
      const searchRule = {
        id: {
          type: 'string',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(searchRule, ctx.query)
      var body = ctx.query
      body.uid = ctx.request.uid
      ctx.body = yield ctx.service.pages.deleteHistory(body)
    }
    * historyPublish () {
      const {
        ctx
      } = this
      const createRule = {
        id: {
          type: 'int',
          required: true
        },
        projectId: {
          type: 'int',
          required: true
        },
        type: {
          type: 'int',
          required: false
        },
        pageKey: {
          type: 'string',
          required: true
        },
        content: {
          type: 'string',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(createRule)
      var body = ctx.request.body
      body.uid = ctx.request.uid;

      const role = yield ctx.service.base.getUserRole(ctx.request.uid, body.projectId)
      var permissionLimit = this.app.config.permissionLimit[body.type] || {}
      if (permissionLimit.publish && !(role <= permissionLimit.publish)) throw this.ctx.getError({msg: '您缺少“管理员”或更高权限，无法发布，请联系该页面管理人员'})

      yield ctx.service.pages.historyPublish(body)
      this.ctx.app.delCache(body.pageKey) // 更新缓存 实际是清除缓存，待下次请求自动进行缓存
    }

    * historyToDraft () {
      const {
        ctx
      } = this
      const createRule = {
        id: {
          type: 'int',
          required: true
        },
        projectId: {
          type: 'int',
          required: true
        },
        type: {
          type: 'int',
          required: false
        },
        pageKey: {
          type: 'string',
          required: true
        },
        content: {
          type: 'string',
          required: true,
          allowEmpty: false
        }
      }
      ctx.validate(createRule)
      var body = ctx.request.body
      body.uid = ctx.request.uid;
      
      const role = yield ctx.service.base.getUserRole(ctx.request.uid, body.projectId)
      var permissionLimit = this.app.config.permissionLimit[body.type] || {}
      if (permissionLimit.save && !(role <= permissionLimit.save)) throw this.ctx.getError({msg: '您缺少“开发者”或更高权限，无法保存，请联系该页面管理人员添加权限'})

      yield ctx.service.pages.historyToDraft(body)
    }

    * updateFork () {
      const createRule = {
        id: {
          type: 'int',
          required: true
        },
      }
      const ctx = this.ctx
      ctx.validate(createRule)
      yield ctx.service.pages.updateFork(ctx.request.body)
    }
  }

  return PagesController
}
