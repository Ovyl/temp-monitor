import { Stack, StackProps, aws_iam, aws_iot, aws_timestream, aws_apigateway } from 'aws-cdk-lib';
import { Construct } from 'constructs';



export class TempMonitorStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // This the role used by our iot Rule that allows it to access our Timeseries database and tables
    const iotTimestreamRole = new aws_iam.Role(this, 'IotTempRuleTimestreamRole', {
      assumedBy: new aws_iam.ServicePrincipal('iot.amazonaws.com'),
    })

    // Timeseries database
    const datastore = new aws_timestream.CfnDatabase(this, 'TemperatureDatastore', {
      databaseName: 'TemperatureDatastore',
    })

    // Our temperature table inside of the our Timeseries database.
    // This will hold all the temperature readings from our devices.
    const temperatureDataTable = new aws_timestream.CfnTable(this, 'TemperatureTable', {
      databaseName: datastore.databaseName!,
      tableName: 'TemperatureTable'
    })
    // Since we're dealing with L1 constructs we need to tell cloudformation to
    // wait for the database to be created before making our table in the database.
    temperatureDataTable.addDependsOn(datastore)

    // this were we assign the policies to our roles using the
    // database and tables that were created before this.
    iotTimestreamRole.addToPrincipalPolicy(new aws_iam.PolicyStatement({
      resources:[temperatureDataTable.attrArn],
      actions: [
        'timestream:WriteRecords'
      ]
    }))
    iotTimestreamRole.addToPrincipalPolicy(new aws_iam.PolicyStatement({
      resources:['*'],
      actions: [
        'timestream:DescribeEndpoints',
      ]
    }))


    // This is our IoT Rule that will forward messsages to our
    // timeseries database.
    // It using interpolation to allow us to extract and add data before
    // sending it to our database. You can see that in the dimensions field
    const tempRule = new aws_iot.CfnTopicRule(this, 'TemperatureRule', {
      ruleName: 'forward_readings_to_timeseries',
      topicRulePayload: {
        description: 'This rule forwards our temperature messages to our timeseries database.',
        awsIotSqlVersion: '2016-03-23',
        sql: "SELECT * FROM 'temp/+/reading'",
        actions: [
          {timestream: {
            roleArn: iotTimestreamRole.roleArn,
            databaseName: temperatureDataTable.databaseName,
            tableName: temperatureDataTable.tableName!,
            dimensions: [
              {name: 'temperature', value: '${temperature}'},
              {name: 'deviceId', value: '${topic(2)}'}
            ]
          }}
        ]
      }
    })
  }
}
