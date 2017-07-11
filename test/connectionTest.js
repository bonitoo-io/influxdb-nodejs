let assert = require('assert');
let InfluxDB=require('../src/InfluxDB');
let util = require('./utils.js')

describe('Connection test', function(){

    describe('#Automatic connect and write', function(){

        let cxnaw = new InfluxDB.Connection({

            database: 'test1'

        })

        let dp1 = {
            measurement: 'location',
//            timestamp: new Date(), //N.B. client should fill in missing timestamp automatically
            tags: [{ key: 'unit', value: 'adam-12' }],
            fields: [{ key: 'coordinates' , value: '34_06_46_N_118_20_20_W'}]
        }

        let dp2 = {
            measurement: 'location',
//            timestamp: new Date(),
            tags: [{ key: 'unit', value: 'l-30' }],
            fields: [{ key: 'coordinates' , value: '34.11856_N_118.30037_W'}]
        }

        let dp3 = {
            measurement: 'location',
//            timestamp: new Date(),
            tags: [{ key: 'unit', value: 'zebra-07' }],
            fields: [{ key: 'coordinates' , value: '33_56_33_N_118_24_29_W'}]
        }

        it('should automatically connect and write data points, incl. timestamp', function(done){

            cxnaw.write([dp1,dp2, dp3], true).then(() => {
                done()
            }).catch((e) => {
                done(e)
            })

        })

        it('should read back and verify the data', function(done){

            util.sleep(500).then(() => {

                cxnaw.executeQuery('Select * from location').then((result) => {
//                    console.log(result)
                    assert.equal(result.length, 3)

                    for(let dp of result){
                        assert( dp.time !== undefined);
                        switch(dp.unit){
                            case 'adam-12':
                                assert.equal(dp.coordinates, dp1.fields[0].value)
                                break;
                            case 'l-30':
                                assert.equal(dp.coordinates, dp2.fields[0].value)
                                break;
                            case 'zebra-07':
                                assert.equal(dp.coordinates, dp3.fields[0].value)
                                break;
                            default:
                                assert.fail(dp.unit, dp.coordinates, 'Unexpected element in results array');
                                break;
                        }
                    }

                    done()

                }).catch((e) => {
                    done(e)
                })
            })

        })

        it('should drop the measurement', function(done){
            let result = util.dropMeasurement(cxnaw,'location');

            //take a moment for transaction to complete otherwise lose connection object too soon in some cases
            util.sleep(1000).then(() => { done(result)});

        })

    });

    describe('#Cache size automatic write', function(){

        let cxnsm = new InfluxDB.Connection({

            database: 'test1',
            batchSize: 100,
            maximumWriteDelay: 5000 // set longer write delay to ensure auto write triggered by buffer size

        });

        let testdps = util.buildDatapoints('distance',
                                   [{name: 'unit', base: 'baker-', type: 'string'}],
                                   [{name: 'frombase', base: 0, type: 'float'}],
                                   300) //force buffer to flush three times in succession
        let chunk_size = 10;
        //will write in chunks of 10 items
        let dpchunks = testdps.map( function(e, i){
            return i%chunk_size===0 ? testdps.slice(i, i+chunk_size) : null
        }).filter(function(e){ return e;});

        it('should write successive chunks to buffer and trigger write to db', function(done){
            cxnsm.connect().then(() => {
                for(let chunk of dpchunks){
                    cxnsm.write(chunk).catch((e) => {
                        done(e);
                    })
                }
                done();
            }).catch((e) => {
                done(e)
            })
        });

        it('should read back the data', function(done){

            cxnsm.connect().then(() => {
                cxnsm.executeQuery('SELECT * FROM distance').then((result) => {
                    assert(result.length, testdps.length);
                    done()
                }).catch((e) => {
                    done(e)
                })
            }).catch((e) => {
                done(e)
            })

        });

        it('shoud drop the test measurement', function(done){

            let result = util.dropMeasurement(cxnsm, 'distance');
            //take a moment for transaction to complete otherwise lose connection object too soon in some cases
            util.sleep(1000).then(() => { done(result)});

        })


    });

    describe('#Timeout expire automatic write', function(){

        let writeDelay = 1000; //default writeDelay

        let cxnquick = new InfluxDB.Connection({

            database: 'test1',
            maximumWriteDelay: writeDelay

        });

        let dp1 = {
            measurement: 'temperature',
            timestamp: new Date(), //N.B. client should fill in missing timestamp automatically
            tags: [{ key: 'turbine', value: 'bremerhaven-0013' }],
            fields: [{ key: 'celsius' , value: '67.3'}]
        }

        let dp2 = {
            measurement: 'temperature',
            timestamp: new Date(),
            tags: [{ key: 'turbine', value: 'bremerhaven-0017' }],
            fields: [{ key: 'celsius' , value: '22'}]
        }

        let dp3 = {
            measurement: 'temperature',
            timestamp: new Date(),
            tags: [{ key: 'turbine', value: 'bremerhaven-0019' }],
            fields: [{ key: 'celsius' , value: '39.5'}]
        }

        it('should write to db after delay expires', function(done){

            cxnquick.connect().then(() => {
                cxnquick.write([dp1, dp2, dp3]).then(() => {
                    done()
                }).catch((e) => {
                    done(e)
                })
            }).catch((e) => {
                done(e)
            })

        });

        it('should read back the data after the delay of ' + writeDelay + 'ms expires', function(done){

            cxnquick.connect().then(() => {
                util.sleep(writeDelay).then(() => {
                    cxnquick.executeQuery('Select * from temperature').then((result) => {
                        assert.equal(result.length, 3);
                        for(let dp of result){
                            switch(dp.turbine){
                                case 'bremerhaven-0013':
                                    assert.equal(dp.celsius, dp1.fields[0].value);
                                    break;
                                case 'bremerhaven-0017':
                                    assert.equal(dp.celsius, dp2.fields[0].value);
                                    break;
                                case 'bremerhaven-0019':
                                    assert.equal(dp.celsius, dp3.fields[0].value);
                                    break;
                                default:
                                    throw new Error('Unknown element in results array');
                                    break;
                            }
                        }
                        done()
                    }).catch((e) => {
                        done(e)
                    })
                }).catch((e) => {
                    done(e)
                })
            }).catch((e) => {
                done(e)
            })

        });

        it('should drop the test data', function(done){

            let result = util.dropMeasurement(cxnquick, 'temperature');
            util.sleep(1000).then(() => {
                done(result)
            })

        })

    });

    /*
       1. should reliably write to influxdb
       2. no need to call flush, wait for buffer to fill or timeout - returns only after write
       3. should be slower than when set to true
     */
    describe("#autoResolvePromissedWritesToCache - false", function(){

        let cxnauto = new InfluxDB.Connection({
            database: 'test1',
            autoResolvePromisedWritesToCache: true
        })

        let cxnwait = new InfluxDB.Connection({
            database: 'test1',
            autoResolvePromisedWritesToCache: false
        })


        let dps = util.buildDatapoints('temp',
            [{name: 'thermometer', base: 'tmeter', type: 'string'}],
            [{name: 'cels', base: 17, type: 'float'}],
            3000)

        let autoWriteTime = 0

        // get initial time of autoResolvePromisedWritesToCache: true for later comparison
        cxnauto.connect().then(() => {
            let start = new Date().getTime();
            cxnauto.write(dps).then(() => {
                let end = new Date().getTime();
                autoWriteTime = end - start;
            }).catch((e) => {
                 console.log('error', e)
            })
        }).catch((e) => {
            console.log('error', e)
        })

        let result = util.dropMeasurement(cxnauto, 'temp');
        //take a moment for transaction to complete otherwise lose connection object too soon in some cases
        util.sleep(2000).then(() => { }); //should be dropped

        it('should write points to server and then return promise', function(done){

            let waitWriteTime = 0;

            cxnwait.connect().then(() => {
                let start = new Date().getTime()
                cxnwait.write(dps).then(() => {
                    let end = new Date().getTime()
                    waitWriteTime = end - start;
                    console.log(`autoResolvePromisedWritesToCache(false) ${util.pad(waitWriteTime,6,' ')}ms`);
                    console.log(`autoResolvePromisedWritesToCache(true)  ${util.pad(autoWriteTime, 6, ' ')}ms`);
                    console.log(`autoResolvePromisedWritesToCache(diff)  ${util.pad(waitWriteTime - autoWriteTime, 6, ' ')}ms`)
                    assert( waitWriteTime > autoWriteTime)
                    done()
                }).catch((e) => {
                    done(e)
                })
            }).catch((e) => {
                done(e)
            })

        });

        it('should read the points back', function(done){
           cxnwait.connect().then(() => {

               cxnwait.executeQuery('select * from temp').then((result) => {
                   assert(result.length == dps.length)
                   done()
               }).catch((e) => {
                   done(e)
               })

           }).catch((e) => {
               done(e)
           })
        });

        it('should drop the datapoints', function(done){

            let result = util.dropMeasurement(cxnwait, 'temp');
            //take a moment for transaction to complete otherwise lose connection object too soon in some cases
            util.sleep(1000).then(() => { done(result)});

        })

    });

});